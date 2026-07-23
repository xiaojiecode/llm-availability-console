package app

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
)

type secretBox struct {
	gcm cipher.AEAD
}

func newSecretBox(path string) (*secretBox, error) {
	key, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		key = make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return nil, err
		}
		if err := os.WriteFile(path, key, 0o600); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("master key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &secretBox{gcm: gcm}, nil
}

func (s *secretBox) seal(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	nonce := make([]byte, s.gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := s.gcm.Seal(nonce, nonce, []byte(value), nil)
	return base64.RawStdEncoding.EncodeToString(ciphertext), nil
}

func (s *secretBox) open(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	raw, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	size := s.gcm.NonceSize()
	if len(raw) < size {
		return "", fmt.Errorf("encrypted value is too short")
	}
	plaintext, err := s.gcm.Open(nil, raw[:size], raw[size:], nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
