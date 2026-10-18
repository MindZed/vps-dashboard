package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mindzed-sentinel/storage"
)

type BotClient struct {
	token       string
	adminChatID string
	store       *storage.Store
	httpClient  *http.Client
}

type TelegramUpdate struct {
	UpdateID int              `json:"update_id"`
	Message  *TelegramMessage `json:"message"`
}

type TelegramMessage struct {
	MessageID int          `json:"message_id"`
	From      TelegramUser `json:"from"`
	Chat      TelegramChat `json:"chat"`
	Date      int64        `json:"date"`
	Text      string       `json:"text"`
}

type TelegramUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	Username  string `json:"username"`
}

type TelegramChat struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

func NewBot(token, adminChatID string, store *storage.Store) *BotClient {
	return &BotClient{
		token:       strings.TrimSpace(token),
		adminChatID: strings.TrimSpace(adminChatID),
		store:       store,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

// SendMessage delivers a Markdown-formatted message to a single chat ID
func (b *BotClient) SendMessage(chatID string, text string) error {
	if b.token == "" || chatID == "" {
		return nil
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", b.token)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "Markdown",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("telegram API error (status %d): %s", resp.StatusCode, string(respBytes))
	}

	return nil
}

// Broadcast sends a message to all registered subscribers
func (b *BotClient) Broadcast(text string) {
	if b.token == "" {
		return
	}

	subscribers, err := b.store.ListTelegramSubscribers()
	if err != nil || len(subscribers) == 0 {
		// Fallback to admin chat ID
		if b.adminChatID != "" {
			_ = b.SendMessage(b.adminChatID, text)
		}
		return
	}

	for _, sub := range subscribers {
		go func(cid string) {
			if err := b.SendMessage(cid, text); err != nil {
				log.Printf("[TELEGRAM] Failed to send to %s: %v", cid, err)
			}
		}(sub.ChatID)
	}
}

// BroadcastAlert fires an immediate push alert for a failed service
func (b *BotClient) BroadcastAlert(serviceName, targetURL, errMsg string) {
	istLocation, _ := time.LoadLocation("Asia/Kolkata")
	timeStr := time.Now().In(istLocation).Format("2006-01-02 15:04:05")

	msg := fmt.Sprintf(
		"🚨 *MINDZED ALERT: Service Down*\n"+
			"━━━━━━━━━━━━━━━━━━\n"+
			"• *Service:* %s\n"+
			"• *Target:* `%s`\n"+
			"• *Error:* %s\n"+
			"• *Detected:* %s IST\n"+
			"━━━━━━━━━━━━━━━━━━\n"+
			"⚠️ _Sentinel watchdog detected failure. Investigating incident._",
		escapeMarkdown(serviceName),
		escapeMarkdown(targetURL),
		escapeMarkdown(errMsg),
		timeStr,
	)

	log.Printf("[TELEGRAM] Broadcasting alert for %s", serviceName)
	b.Broadcast(msg)
}

// BroadcastRecovery fires an immediate notification when a service recovers
func (b *BotClient) BroadcastRecovery(serviceName, targetURL string, latencyMs int64, durationSec int) {
	istLocation, _ := time.LoadLocation("Asia/Kolkata")
	timeStr := time.Now().In(istLocation).Format("2006-01-02 15:04:05")

	durationStr := formatDuration(durationSec)

	msg := fmt.Sprintf(
		"✅ *MINDZED RECOVERY: Service Restored*\n"+
			"━━━━━━━━━━━━━━━━━━\n"+
			"• *Service:* %s\n"+
			"• *Target:* `%s`\n"+
			"• *Latency:* %d ms\n"+
			"• *Downtime Duration:* %s\n"+
			"• *Restored:* %s IST\n"+
			"━━━━━━━━━━━━━━━━━━\n"+
			"🟢 _All synthetic health checks passing cleanly._",
		escapeMarkdown(serviceName),
		escapeMarkdown(targetURL),
		latencyMs,
		durationStr,
		timeStr,
	)

	log.Printf("[TELEGRAM] Broadcasting recovery for %s", serviceName)
	b.Broadcast(msg)
}

// StartPolling runs the background long-polling loop to process bot commands
func (b *BotClient) StartPolling(ctx context.Context) {
	if b.token == "" {
		log.Println("[TELEGRAM] Bot token not provided; polling disabled.")
		return
	}

	log.Println("[TELEGRAM] Starting Sentinel Telegram long-polling worker...")

	offset := 0
	pollURL := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates", b.token)

	for {
		select {
		case <-ctx.Done():
			log.Println("[TELEGRAM] Stopping long-polling worker.")
			return
		default:
		}

		reqURL := fmt.Sprintf("%s?timeout=25&offset=%d", pollURL, offset)
		req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		resp, err := b.httpClient.Do(req)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		var updateResp struct {
			OK     bool             `json:"ok"`
			Result []TelegramUpdate `json:"result"`
		}

		if err := json.Unmarshal(body, &updateResp); err != nil || !updateResp.OK {
			time.Sleep(2 * time.Second)
			continue
		}

		for _, update := range updateResp.Result {
			if update.UpdateID >= offset {
				offset = update.UpdateID + 1
			}

			if update.Message != nil && update.Message.Text != "" {
				b.handleCommand(update.Message)
			}
		}
	}
}

func (b *BotClient) handleCommand(msg *TelegramMessage) {
	senderID := strconv.FormatInt(msg.From.ID, 10)
	text := strings.TrimSpace(msg.Text)
	parts := strings.Fields(text)
	if len(parts) == 0 {
		return
	}

	cmd := strings.ToLower(parts[0])
	// Strip bot mention e.g. /onboard@mindzed_oci_bot -> /onboard
	if atIdx := strings.Index(cmd, "@"); atIdx != -1 {
		cmd = cmd[:atIdx]
	}

	isAdmin := senderID == b.adminChatID

	switch cmd {
	case "/start":
		if isAdmin {
			_ = b.store.AddTelegramSubscriber(senderID, msg.From.Username, "admin")
			welcomeAdmin := fmt.Sprintf(
				"👋 *Welcome to MindZed Sentinel Ops, Administrator @%s!*\n\n"+
					"🛡️ You are connected to the live Sentinel watchdog on `mz-micro`.\n\n"+
					"*Available Commands:*\n"+
					"• `/onboard <chat_id>` — Register a friend to receive alerts & reports\n"+
					"• `/subscribers` — List all registered recipients\n"+
					"• `/remove <chat_id>` — Revoke recipient access\n"+
					"• `/status` — View live health of all monitored services\n"+
					"• `/ping` — Verify connectivity",
				escapeMarkdown(msg.From.Username),
			)
			_ = b.SendMessage(senderID, welcomeAdmin)
		} else {
			// Check if already an onboarded member
			subs, _ := b.store.ListTelegramSubscribers()
			isMember := false
			for _, s := range subs {
				if s.ChatID == senderID {
					isMember = true
					break
				}
			}

			if isMember {
				_ = b.SendMessage(senderID, "👋 *Welcome back to MindZed Alerts!*\nYou are an active recipient of real-time infrastructure alerts.")
			} else {
				_ = b.SendMessage(senderID, "🔒 *MindZed Sentinel Access Restricted*\nPlease ask the administrator to onboard your Telegram ID (`"+senderID+"`).")
			}
		}

	case "/onboard":
		if !isAdmin {
			_ = b.SendMessage(senderID, "⛔ *Access Denied*: Only the administrator can onboard new recipients.")
			return
		}

		if len(parts) < 2 {
			_ = b.SendMessage(senderID, "ℹ️ *Usage:* `/onboard <telegram_numerical_chat_id>`\n\nAsk your friend to start @userinfobot to find their numerical ID.")
			return
		}

		friendChatID := strings.TrimSpace(parts[1])
		if _, err := strconv.ParseInt(friendChatID, 10, 64); err != nil {
			_ = b.SendMessage(senderID, "❌ *Invalid Chat ID*: Please provide a valid numerical Telegram user ID.")
			return
		}

		err := b.store.AddTelegramSubscriber(friendChatID, "", "member")
		if err != nil {
			_ = b.SendMessage(senderID, fmt.Sprintf("❌ *Failed to onboard:* %v", err))
			return
		}

		// Confirmation to Admin
		_ = b.SendMessage(senderID, fmt.Sprintf("✅ *Successfully onboarded friend (`%s`)!*\nThey will now receive all real-time downtime alerts and 09:00 AM IST daily reports.", friendChatID))

		// Welcome greeting to Friend
		friendGreeting := "🎉 *Welcome to MindZed Infrastructure Telemetry!*\n\n" +
			"You have been onboarded by the administrator to receive:\n" +
			"• ⚡ Instant real-time downtime & recovery alerts (< 2s)\n" +
			"• 📊 09:00 AM IST Complete Day Infrastructure Reports\n\n" +
			"_You're all set! No further action required._"
		_ = b.SendMessage(friendChatID, friendGreeting)

	case "/subscribers":
		if !isAdmin {
			_ = b.SendMessage(senderID, "⛔ *Access Denied*")
			return
		}

		subs, err := b.store.ListTelegramSubscribers()
		if err != nil || len(subs) == 0 {
			_ = b.SendMessage(senderID, "📋 *No subscribers found in database.*")
			return
		}

		var sb strings.Builder
		sb.WriteString("📋 *MindZed Alert Subscribers (" + strconv.Itoa(len(subs)) + "):*\n━━━━━━━━━━━━━━━━━━\n")
		for i, s := range subs {
			userTag := s.Username
			if userTag == "" {
				userTag = "(no username)"
			} else {
				userTag = "@" + userTag
			}
			badge := "👤 Member"
			if s.Role == "admin" {
				badge = "👑 Admin"
			}
			sb.WriteString(fmt.Sprintf("%d. `%s` • %s • %s\n", i+1, s.ChatID, userTag, badge))
		}
		_ = b.SendMessage(senderID, sb.String())

	case "/remove":
		if !isAdmin {
			_ = b.SendMessage(senderID, "⛔ *Access Denied*")
			return
		}

		if len(parts) < 2 {
			_ = b.SendMessage(senderID, "ℹ️ *Usage:* `/remove <chat_id>`")
			return
		}

		targetID := strings.TrimSpace(parts[1])
		if targetID == b.adminChatID {
			_ = b.SendMessage(senderID, "⚠️ *Cannot remove administrator account.*")
			return
		}

		_ = b.store.RemoveTelegramSubscriber(targetID)
		_ = b.SendMessage(senderID, fmt.Sprintf("🗑️ *Removed subscriber `%s`.*", targetID))
		_ = b.SendMessage(targetID, "ℹ️ *Your subscription to MindZed Alerts has been removed by the administrator.*")

	case "/status":
		statusMsg := b.buildStatusSnapshot()
		_ = b.SendMessage(senderID, statusMsg)

	case "/ping":
		_ = b.SendMessage(senderID, "🏓 *Pong!* MindZed Sentinel daemon is responsive and probing.")

	case "/help":
		helpText := "*MindZed Ops Bot Commands:*\n\n" +
			"• `/status` — View current fleet health & active incidents\n" +
			"• `/ping` — Check bot response latency\n"
		if isAdmin {
			helpText += "• `/onboard <chat_id>` — Add friend to alerts\n" +
				"• `/subscribers` — List all alert recipients\n" +
				"• `/remove <chat_id>` — Remove a recipient\n"
		}
		_ = b.SendMessage(senderID, helpText)
	}
}

func (b *BotClient) buildStatusSnapshot() string {
	monitors, err := b.store.ListMonitors()
	if err != nil {
		return "⚠️ Failed to fetch monitor status."
	}

	var sb strings.Builder
	sb.WriteString("🛡️ *MindZed Fleet Watchdog Status*\n━━━━━━━━━━━━━━━━━━\n")
	upCount := 0
	for _, m := range monitors {
		if !m.Active {
			continue
		}
		// Get last ping
		_, _, avg := b.store.GetMonitorStats(m.ID, 1)
		icon := "🟢"
		upCount++
		sb.WriteString(fmt.Sprintf("%s *%s*\n  └ `%s` • %dms avg\n", icon, escapeMarkdown(m.Name), escapeMarkdown(m.URL), avg))
	}

	sb.WriteString("━━━━━━━━━━━━━━━━━━\n")
	sb.WriteString(fmt.Sprintf("📊 *Active Monitors:* %d\n", upCount))
	sb.WriteString("⚡ *Heartbeat Rate:* Every 30-60s")
	return sb.String()
}

func escapeMarkdown(text string) string {
	text = strings.ReplaceAll(text, "*", "\\*")
	text = strings.ReplaceAll(text, "_", "\\_")
	text = strings.ReplaceAll(text, "[", "\\[")
	text = strings.ReplaceAll(text, "`", "\\`")
	return text
}

func formatDuration(sec int) string {
	if sec < 60 {
		return fmt.Sprintf("%ds", sec)
	}
	m := sec / 60
	s := sec % 60
	if m < 60 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	h := m / 60
	m = m % 60
	return fmt.Sprintf("%dh %dm", h, m)
}
