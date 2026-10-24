// Site page: subscription links, copy to clipboard, and the calendar built from the site's .ics file.
// The page names its calendar file on <body data-calendar="streams.ics">.
(function () {
  const REFRESH_INTERVAL = 10 * 60 * 1000;
  const REFRESH_ON_RETURN_AFTER = 60 * 1000;
  const STATE_INTERVAL = 60 * 1000;
  const LIST_DAYS = 14;
  const NARROW_SCREEN = '(max-width: 640px)';
  // FullCalendar locale per page language; `en-gb` gives day-month dates and the 24-hour clock.
  const CALENDAR_LOCALES = { en: 'en-gb', ru: 'ru' };

  const $ = (id) => document.getElementById(id);
  const t = (key, vars) => I18n.t(key, vars);

  const calendarUrl = new URL(document.body.dataset.calendar, location.href).href;
  const webcalUrl = calendarUrl.replace(/^https?:/, 'webcal:');

  // Subscribe block

  function initSubscribe() {
    $('calendar-url').value = calendarUrl;
    $('webcal-link').href = webcalUrl;
    $('google-link').href = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcalUrl);
    $('copy-button').addEventListener('click', copyUrl);
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(calendarUrl);
      showToast(t('subscribe.copied') || 'Link copied');
    } catch (e) {
      const input = $('calendar-url');
      input.focus();
      input.select();
    }
  }

  let toastTimer;

  function showToast(text) {
    const toast = $('toast');
    toast.textContent = text;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2000);
  }

  // Calendar data

  let entries = null;
  let lastLoad = 0;
  let loading = null;
  let calendar = null;

  function parseCalendar(text) {
    const root = new ICAL.Component(ICAL.parse(text));
    for (const zone of root.getAllSubcomponents('vtimezone')) {
      ICAL.TimezoneService.register(zone);
    }
    const result = [];
    for (const vevent of root.getAllSubcomponents('vevent')) {
      try {
        const event = new ICAL.Event(vevent);
        result.push({
          id: event.uid,
          title: event.summary || '',
          start: event.startDate.toJSDate(),
          end: event.endDate.toJSDate(),
          description: event.description || '',
          image: vevent.getFirstPropertyValue('image') || '',
        });
      } catch (e) {
        console.warn('Skipping an unreadable calendar entry', e);
      }
    }
    return result;
  }

  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const response = await fetch(calendarUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        entries = parseCalendar(await response.text());
        lastLoad = Date.now();
        showCalendar();
      } catch (e) {
        console.error('Failed to load the calendar', e);
        if (!entries) showError();
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function stateOf(entry, now) {
    if (entry.end <= now) return 'past';
    if (entry.start <= now) return 'live';
    return 'upcoming';
  }

  function eventSource(info, success) {
    const now = new Date();
    success((entries || []).map((entry) => {
      const state = stateOf(entry, now);
      return {
        id: entry.id,
        title: entry.title,
        start: entry.start,
        end: entry.end,
        classNames: state === 'upcoming' ? [] : ['is-' + state],
        extendedProps: { entry, state },
      };
    }));
  }

  // Calendar view

  function calendarTexts() {
    return {
      buttonText: { today: t('calendar.today'), month: t('calendar.month'), week: t('calendar.week'), list: t('calendar.list') },
      noEventsText: t('calendar.noEvents'),
    };
  }

  function createCalendar() {
    calendar = new FullCalendar.Calendar($('calendar'), {
      locale: CALENDAR_LOCALES[I18n.lang] || CALENDAR_LOCALES.en,
      timeZone: 'local',
      firstDay: 1,
      height: 'auto',
      initialView: matchMedia(NARROW_SCREEN).matches ? 'listDays' : 'dayGridMonth',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listDays' },
      views: {
        listDays: { type: 'list', duration: { days: LIST_DAYS } },
      },
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      eventDisplay: 'block',
      dayMaxEvents: false,
      allDaySlot: false,
      nowIndicator: true,
      eventInteractive: true,
      events: eventSource,
      eventDidMount: markLive,
      eventClick: (info) => openDialog(info.event.extendedProps.entry),
      ...calendarTexts(),
    });
    calendar.render();
  }

  function markLive(info) {
    if (info.event.extendedProps.state !== 'live') return;
    const title = info.el.querySelector('.fc-event-title, .fc-list-event-title a, .fc-list-event-title');
    if (title) title.prepend(liveBadge());
  }

  function liveBadge() {
    const badge = document.createElement('span');
    badge.className = 'live-badge';
    const dot = document.createElement('span');
    dot.className = 'live-dot';
    badge.append(dot, t('calendar.live') || 'LIVE');
    return badge;
  }

  function showCalendar() {
    $('calendar-error').hidden = true;
    $('calendar').hidden = false;
    if (calendar) calendar.refetchEvents();
    else createCalendar();
  }

  function showError() {
    $('calendar').hidden = true;
    $('calendar-error').hidden = false;
  }

  function applyLanguage() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $('tz-caption').textContent = zone ? t('schedule.timeZone', { zone }) || `Times are shown in ${zone}` : '';
    if (!calendar) return;
    calendar.batchRendering(() => {
      calendar.setOption('locale', CALENDAR_LOCALES[I18n.lang] || CALENDAR_LOCALES.en);
      const texts = calendarTexts();
      calendar.setOption('buttonText', texts.buttonText);
      calendar.setOption('noEventsText', texts.noEventsText);
    });
    calendar.refetchEvents();
  }

  // Event dialog

  const LINK_LINE = /^([^:\n]+):\s*(https?:\/\/\S+)$/;

  // Splits off the last block of the description when it holds only "<name>: <url>" lines.
  function splitDescription(description) {
    const blocks = description.trim().split(/\n\s*\n/);
    const lines = blocks[blocks.length - 1].split('\n').map((line) => line.trim());
    if (blocks.length && lines.every((line) => LINK_LINE.test(line))) {
      blocks.pop();
      const links = lines.map((line) => {
        const [, name, url] = line.match(LINK_LINE);
        return { name: name.trim(), url };
      });
      return { text: blocks.join('\n\n'), links };
    }
    return { text: description.trim(), links: [] };
  }

  function formatTime(start, end) {
    const locale = CALENDAR_LOCALES[I18n.lang] || CALENDAR_LOCALES.en;
    const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long' });
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const sameDay = start.toDateString() === end.toDateString();
    return sameDay
      ? `${day.format(start)}, ${time.format(start)} – ${time.format(end)}`
      : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)}`;
  }

  function openDialog(entry) {
    const dialog = $('event-dialog');
    const image = $('dialog-image');
    image.hidden = !entry.image;
    if (entry.image) image.src = entry.image;
    else image.removeAttribute('src');

    const title = $('dialog-title');
    title.textContent = entry.title;
    if (stateOf(entry, new Date()) === 'live') title.prepend(liveBadge());

    $('dialog-time').textContent = formatTime(entry.start, entry.end);

    const { text, links } = splitDescription(entry.description);
    const description = $('dialog-description');
    description.textContent = text;
    description.hidden = !text;

    const linkBox = $('dialog-links');
    linkBox.replaceChildren(...links.map((link) => {
      const a = document.createElement('a');
      a.className = 'button';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = link.name;
      return a;
    }));
    linkBox.hidden = !links.length;

    dialog.showModal();
    dialog.scrollTop = 0;
  }

  function initDialog() {
    const dialog = $('event-dialog');
    $('dialog-close').addEventListener('click', () => dialog.close());
    // A click on the backdrop targets the dialog element itself.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  // Refresh

  function initRefresh() {
    setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_INTERVAL);
    setInterval(() => {
      if (calendar && document.visibilityState === 'visible') calendar.refetchEvents();
    }, STATE_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad > REFRESH_ON_RETURN_AFTER) load();
    });
    $('retry-button').addEventListener('click', load);
  }

  initSubscribe();
  initDialog();
  initRefresh();
  I18n.onChange(applyLanguage);
  I18n.ready.then(load);
})();
