package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type probeOutcome struct {
	Success         bool
	StatusCode      int
	LatencyMs       int64
	Error           string
	ResponseExcerpt string
}

func probeChannel(ctx context.Context, channel Channel, apiKey string) probeOutcome {
	start := time.Now()
	payload := map[string]any{
		"model":      channel.Model,
		"max_tokens": 1,
		"messages":   []map[string]any{{"role": "user", "content": "ping"}},
	}
	var endpoint string
	var headers map[string]string
	if channel.Provider == "anthropic" {
		endpoint = apiEndpoint(channel.BaseURL, "/v1/messages")
		headers = map[string]string{
			"content-type":      "application/json",
			"accept":            "application/json",
			"x-api-key":         apiKey,
			"anthropic-version": "2023-06-01",
		}
	} else {
		endpoint = apiEndpoint(channel.BaseURL, "/v1/chat/completions")
		payload["temperature"] = 0
		headers = map[string]string{
			"content-type":  "application/json",
			"accept":        "application/json",
			"authorization": "Bearer " + apiKey,
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return probeOutcome{LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return probeOutcome{LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()}
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	client := &http.Client{Timeout: 25 * time.Second}
	response, err := client.Do(request)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return probeOutcome{LatencyMs: latency, Error: err.Error()}
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
	excerpt := strings.TrimSpace(string(raw))
	if len(excerpt) > 512 {
		excerpt = excerpt[:512]
	}
	outcome := probeOutcome{
		StatusCode:      response.StatusCode,
		LatencyMs:       latency,
		ResponseExcerpt: excerpt,
		Success:         response.StatusCode >= 200 && response.StatusCode < 300,
	}
	if !outcome.Success {
		outcome.Error = fmt.Sprintf("HTTP %d", response.StatusCode)
		if excerpt != "" {
			outcome.Error += ": " + excerpt
		}
	}
	return outcome
}

func apiEndpoint(baseURL, path string) string {
	base := strings.TrimRight(baseURL, "/")
	if strings.HasSuffix(base, "/v1") {
		return base + strings.TrimPrefix(path, "/v1")
	}
	return base + path
}
