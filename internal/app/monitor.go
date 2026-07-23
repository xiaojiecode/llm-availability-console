package app

import (
	"context"
	"log"
	"sync"
	"time"
)

type Monitor struct {
	store *Store
	stop  chan struct{}
	wg    sync.WaitGroup
	runMu sync.Mutex
}

func NewMonitor(store *Store) *Monitor {
	return &Monitor{store: store, stop: make(chan struct{})}
}

func (m *Monitor) Start() {
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		m.runAll()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				m.runAll()
			case <-m.stop:
				return
			}
		}
	}()
}

func (m *Monitor) Stop() {
	close(m.stop)
	m.wg.Wait()
}

func (m *Monitor) RunChannel(ctx context.Context, id int64) (ProbeView, error) {
	m.runMu.Lock()
	defer m.runMu.Unlock()
	channel, apiKey, err := m.store.GetChannel(ctx, id)
	if err != nil {
		return ProbeView{}, err
	}
	outcome := probeChannel(ctx, channel, apiKey)
	probe := ProbeView{
		ChannelID:       id,
		Success:         outcome.Success,
		StatusCode:      outcome.StatusCode,
		LatencyMs:       outcome.LatencyMs,
		Error:           outcome.Error,
		ResponseExcerpt: outcome.ResponseExcerpt,
		CheckedAt:       time.Now().UTC(),
	}
	if err := m.store.SaveProbe(ctx, probe); err != nil {
		return ProbeView{}, err
	}
	return probe, nil
}

func (m *Monitor) runAll() {
	ctx, cancel := context.WithTimeout(context.Background(), 55*time.Second)
	defer cancel()
	channels, err := m.store.ListChannels(ctx)
	if err != nil {
		log.Printf("list channels: %v", err)
		return
	}
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for _, channel := range channels {
		if !channel.Enabled {
			continue
		}
		channel := channel
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if _, err := m.RunChannel(ctx, channel.ID); err != nil {
				log.Printf("probe channel %d: %v", channel.ID, err)
			}
		}()
	}
	wg.Wait()
}
