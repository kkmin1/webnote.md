package habits

import (
	"bytes"
	_ "embed"
	"fmt"
	"html/template"
	"time"

	"github.com/zakirullin/files.md/server/config"
	"github.com/zakirullin/files.md/server/fs"
	"github.com/zakirullin/files.md/server/userconfig"
)

//go:embed templates/habits.html
var html string

func Render(userID int64, userFS *fs.FS) ([]byte, error) {
	tmpl, err := template.New("habits").Parse(html)
	if err != nil {
		return nil, fmt.Errorf("can't parse habits template: %w", err)
	}

	cfg := userconfig.NewConfig(userFS, userID, config.ServerCfg.ConfigFilename)

	habits, err := LastWeekHabits(userFS, cfg.Timezone())
	if err != nil {
		return nil, fmt.Errorf("can't render habit: %w", err)
	}

	moods, ok := habits[MoodHabit]
	if ok {
		delete(habits, MoodHabit)
	}

	var out bytes.Buffer
	err = tmpl.Execute(&out, map[string]any{
		"habits":     habits,
		"moods":      moods,
		"moodEmojis": MoodEmojis,
		"host":       config.ServerCfg.APIHost(),
		"userID":     userID,
		"currentDay": time.Now().YearDay(),
	})
	if err != nil {
		return nil, fmt.Errorf("can't render habits template: %w", err)
	}

	return out.Bytes(), nil
}
