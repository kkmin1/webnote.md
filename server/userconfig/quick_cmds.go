package userconfig

import (
	"fmt"
)

func (c *Config) AddQuickCmd(cmd string) error {
	lock := c.userLock()
	lock.Lock()
	defer lock.Unlock()

	cfg, err := c.read(c.filename)
	if err != nil {
		return fmt.Errorf("can't add quick cmd: can't read config: %w", err)
	}

	for _, existingCmd := range cfg.QuickCmds {
		if existingCmd == cmd {
			return nil
		}
	}

	cfg.QuickCmds = append(cfg.QuickCmds, cmd)
	err = c.write(cfg)
	if err != nil {
		return fmt.Errorf("can't add quick cmd: can't write config: %w", err)
	}

	return nil
}

func (c *Config) QuickCmds() ([]string, error) {
	cfg, err := c.read(c.filename)
	if err != nil {
		return nil, fmt.Errorf("can't get quick cmds: can't read config: %w", err)
	}

	return cfg.QuickCmds, nil
}

func (c *Config) DelQuickCmd(cmd string) error {
	lock := c.userLock()
	lock.Lock()
	defer lock.Unlock()

	cfg, err := c.read(c.filename)
	if err != nil {
		return fmt.Errorf("can't del quick cmd: can't read config: %w", err)
	}

	newCmds := []string{}
	for _, curQuickCmd := range cfg.QuickCmds {
		if curQuickCmd != cmd {
			newCmds = append(newCmds, curQuickCmd)
		}
	}
	cfg.QuickCmds = newCmds

	err = c.write(cfg)
	if err != nil {
		return fmt.Errorf("can't del quick cmd: can't write config: %w", err)
	}

	return nil
}
