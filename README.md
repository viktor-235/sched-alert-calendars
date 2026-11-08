# sched-alert-calendars

Event calendars published by [sched-alert-bot](https://github.com/viktor-235/sched-alert-bot) and served by GitHub Pages at <https://viktor-235.github.io/sched-alert-calendars/>.

The bot scrapes event schedules from websites, announces them in Telegram and writes them to iCalendar (`.ics`) files. This repository hosts those files, so calendar apps can subscribe to them by URL, and a small static site to browse them.

To subscribe, open the site page and use Subscribe or Add to Google Calendar, or add the calendar URL in your calendar app by hand. The calendar updates automatically; how often the app refreshes it depends on the app (Google Calendar does it with a delay, usually from a few hours to a day).

## How it updates

The bot commits the calendar files through the GitHub Contents API, at most once per `min-interval` (10 minutes by default) and only when the file changed. It touches only its own `.ics` files; everything else is edited by hand. Setup and settings: [Calendar publishing](https://github.com/viktor-235/sched-alert-bot#calendar-publishing) in the bot's README.

## Site

Plain HTML, CSS and JavaScript, no build step. A site page loads its calendar file named on `<body data-calendar="streams.ics">`, parses it with ical.js and shows it with FullCalendar in the viewer's time zone. It reloads the file every 10 minutes while the tab is open.

## Layout

```
.nojekyll               Pages serve files as is
index.html              Home page: list of calendars
i18n/<lang>.json        Home page texts
assets/
  site.css              Shared styles
  i18n.js               Language selection and texts
  calendar-page.js      Site page: subscribe links and the calendar view
  vendor/               Third-party libraries, see vendor/README.md
<site>/
  <content>.ics         Calendar file, written by the bot
  index.html            Site page
  i18n/<lang>.json      Site page texts
```

### Local preview

The pages load files with `fetch`, which does not work from `file://`. Serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

and open <http://localhost:8000/>.
