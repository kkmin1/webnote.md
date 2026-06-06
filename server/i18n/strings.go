package i18n

// How many refs per every constant? Maybe we can leave literal constants
const (
	StrLater           = "⏳"
	StrHome            = "🏠 Home"
	StrBack            = "⬅️ Back"
	StrComplete        = "✅ Complete"
	StrMoveToLaterLong = "⏳ Move to later"
	StrToToday         = "➡️ Move to today"
	StrToTomorrow      = "🌚 To tmrw"
	StrToLater         = "⏳ To later"
	StrToADay          = "📆 To a day"
	StrToChecklist     = "☑️ To Checklist"
	StrToFile          = "📄 To File"
	StrToJournal       = "💚 To Journal"
	StrToRead          = "📚 To Read"
	StrToShop          = "🛒 To Shop"
	StrToWatch         = "📺 To Watch"
	StrGoToToday       = "➡️ Today"
	StrRepeat          = "🔄️ Repeat the task"
	StrQuickBtns       = "⚡️ Quick buttons"
	StrMoveToBtns      = "➡️ Move to buttons"

	StrMonday    = "Mon"
	StrTuesday   = "Tue"
	StrWednesday = "Wed"
	StrThursday  = "Thu"
	StrFriday    = "Fri"
	StrSaturday  = "Sat"
	StrSunday    = "Sun"
	StrWeekdays  = "Weekdays"
	StrEveryday  = "Every day"
)

var PomodoroStarted = "Pomodoro is started: you can see <code>Finished a break</code> task in your task list. Once are ready to focus on something and start working, just complete this task. It will get back in 50 minutes to let you know that you worked enough and deserved a break."

func Tr(str string) string {
	return str
}
