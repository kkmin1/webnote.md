package userconfig

import (
	"fmt"
)

func (c *Config) AddMoveToCmd(cmd string) error {
	lock := c.userLock()
	lock.Lock()
	defer lock.Unlock()

	cfg, err := c.read(c.filename)
	if err != nil {
		return fmt.Errorf("can't add move to cmd: can't read config: %w", err)
	}

	for _, existingCmd := range cfg.MoveToCmds {
		if existingCmd == cmd {
			return nil
		}
	}

	cfg.MoveToCmds = append(cfg.MoveToCmds, cmd)
	err = c.write(cfg)
	if err != nil {
		return fmt.Errorf("can't add move to cmd: can't write config: %w", err)
	}

	return nil
}

func (c *Config) MoveToCmds() ([]string, error) {
	cfg, err := c.read(c.filename)
	if err != nil {
		return nil, fmt.Errorf("can't get move to cmds: can't read config: %w", err)
	}

	return cfg.MoveToCmds, nil
}

func (c *Config) DelMoveToCmd(cmd string) error {
	lock := c.userLock()
	lock.Lock()
	defer lock.Unlock()

	cfg, err := c.read(c.filename)
	if err != nil {
		return fmt.Errorf("can't del move to cmd: can't read config: %w", err)
	}

	newCmds := []string{}
	for _, curMoveToCmd := range cfg.MoveToCmds {
		if curMoveToCmd != cmd {
			newCmds = append(newCmds, curMoveToCmd)
		}
	}
	cfg.MoveToCmds = newCmds

	err = c.write(cfg)
	if err != nil {
		return fmt.Errorf("can't del move to cmd: can't write config: %w", err)
	}

	return nil
}
