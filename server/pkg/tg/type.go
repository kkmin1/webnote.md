package tg

import (
	"encoding/json"
)

type Row interface{}

type Btn struct {
	Name string
	Cmd  Cmd
}

const (
	CmdTypeCallback               = "cmd"
	CmdTypeInlineQueryCurrentChat = "iq"
	CmdTypeWebApp                 = "web"
	CmdTypeURL                    = "url"
)

func NewBtn(name string, cmd Cmd) Btn {
	return Btn{name, cmd}
}

// TODO remove this unnecessary method
func NewRow(btns ...Btn) []Btn {
	return btns
}

type Cmd struct {
	Name   string   `json:"n"`
	Params []string `json:"p"`
	Type   string   `json:"t"`
}

func NewCmd(name string, params []string) Cmd {
	return Cmd{name, params, "cmd"}
}

func NewURLCmd(url string) Cmd {
	return Cmd{"", []string{url}, CmdTypeURL}
}

func NewCustomCmd(name string, params []string, cmdType string) Cmd {
	return Cmd{name, params, cmdType}
}

func (c *Cmd) UnmarshalJSON(data []byte) error {
	// Unmarshal JSON to the alias
	type CmdAlias Cmd
	var ca CmdAlias

	if err := json.Unmarshal(data, &ca); err != nil {
		return err
	}

	ca.Type = "cmd"

	*c = Cmd(ca)

	return nil
}

// Keyboard is an abstraction over Telegram's inline keyboard
type Keyboard struct {
	Btns []Row
}

// NewKeyboard accepts a slice of rows.
// Each row is either a Btn or []Btn
func NewKeyboard(rows []Row) *Keyboard {
	return &Keyboard{rows}
}

func (k *Keyboard) AddRow(r Row) {
	k.Btns = append(k.Btns, r)
}

func (k *Keyboard) PrependRow(r Row) {
	k.Btns = append([]Row{r}, k.Btns...)
}
