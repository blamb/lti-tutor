/*
 * The "Look and feel" control shared by the three tools' instructor views.
 * Served at /vendor/theme-picker.js. A page mounts it with
 *   CourseTheme.mount(element, api, { heading: 'h3' })
 * where api(path, { method, body }) is the page's own JSON helper. It talks
 * to /api/teacher/theme (core/theme-store.ts) and shows a change at once by
 * swapping the page's <style id="course-theme"> rule.
 */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function applyLive(applied) {
    let style = document.getElementById('course-theme');
    if (!applied) {
      if (style) style.remove();
      document.documentElement.removeAttribute('data-course-theme');
      return;
    }
    if (!style) { style = document.createElement('style'); style.id = 'course-theme'; document.head.appendChild(style); }
    style.textContent = applied.css;
    document.documentElement.setAttribute('data-course-theme', applied.name);
  }

  function statusText(s) {
    const a = s.applied;
    if (s.mode === 'off') return 'Using the tool’s own look.';
    if (!a) {
      return s.site_readable
        ? 'This site’s theme could not be read, so the tool keeps its own look. You can pick a theme below.'
        : 'This Moodle site could not be read from here, so the tool keeps its own look.';
    }
    const name = `<strong>${esc(a.label)}</strong>`;
    if (a.source === 'picked') return `Using ${name}, picked for this course.`;
    if (a.source === 'ws') return `Matching this course’s Moodle theme, ${name}, read through the Moodle connection.`;
    let text = `Matching the site’s theme, ${name}.`;
    if (!s.course_lookup) {
      text += s.can_lookup
        ? ' If this course uses a different theme, pick it below. With a Moodle connection whose service allows <code>core_course_get_courses_by_field</code>, the tool finds it by itself.'
        : ' If this course uses a different theme, pick it below.';
    }
    return text;
  }

  function swatch(t) {
    return `<span aria-hidden="true" style="display:inline-flex;align-items:center;gap:.3rem;padding:.15rem .4rem;border-radius:4px;border:1px solid #c9ccd1;background:${esc(t.bg)};color:${esc(t.fg)};${t.font ? `font-family:${esc(t.font)};` : ''}">` +
      `<span style="width:.9rem;height:.9rem;border-radius:50%;background:${esc(t.accent)}"></span>Aa</span>`;
  }

  function mount(el, api, opts) {
    const H = (opts && opts.heading) || 'h3';
    let state = null;
    let options = null;
    let busy = false;

    el.innerHTML =
      `<${H} style="margin:0 0 .35rem">Look and feel</${H}>` +
      '<p class="muted" style="margin:0 0 .5rem">The tool takes its colours and font from this course’s Moodle theme, so it looks like part of the course. ' +
      'Colours are darkened where needed to keep text readable. Students see the result the next time they open the tool.</p>' +
      '<div data-part="status" role="status" style="margin:0 0 .6rem;font-size:.9rem"></div>' +
      '<div data-part="choices" role="group" aria-label="Look and feel for this course" style="display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 .6rem"></div>' +
      '<form data-part="other" style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:0 0 .5rem" hidden>' +
      '<label style="font-size:.9rem">Another theme’s short name <input name="theme" maxlength="60" autocomplete="off" placeholder="such as moove" ' +
      'style="margin-left:.3rem;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--fg);font:inherit"></label>' +
      '<button class="btn btn-ghost" type="submit">Use it</button></form>' +
      '<div style="display:flex;flex-wrap:wrap;gap:.4rem">' +
      '<button class="btn btn-ghost" type="button" data-act="options">Show this site’s themes</button>' +
      '<button class="btn btn-ghost" type="button" data-act="refresh">Read Moodle again</button></div>' +
      '<div data-part="err" class="err" role="alert" style="margin-top:.4rem"></div>';

    const part = (name) => el.querySelector(`[data-part="${name}"]`);
    const choiceStyle = 'display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .7rem;min-height:40px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--fg);font:inherit;cursor:pointer';

    function render() {
      if (!state) return;
      part('status').innerHTML = statusText(state);
      const pressed = (on) => `aria-pressed="${on ? 'true' : 'false'}" style="${choiceStyle}${on ? ';border-color:var(--accent);background:var(--accent-soft);font-weight:600' : ''}"`;
      let html = `<button type="button" data-mode="auto" ${pressed(state.mode === 'auto')}>Match the course</button>`;
      for (const o of options || []) {
        html += `<button type="button" data-mode="picked" data-theme="${esc(o.name)}" ${pressed(state.mode === 'picked' && state.picked_theme === o.name)}>${swatch(o.tokens)} ${esc(o.label)}</button>`;
      }
      if (state.mode === 'picked' && !(options || []).some((o) => o.name === state.picked_theme) && state.applied) {
        html += `<button type="button" data-mode="picked" data-theme="${esc(state.picked_theme)}" ${pressed(true)}>${swatch(state.applied.tokens)} ${esc(state.applied.label)}</button>`;
      }
      html += `<button type="button" data-mode="off" ${pressed(state.mode === 'off')}>The tool’s own look</button>`;
      part('choices').innerHTML = html;
      el.querySelector('[data-act="options"]').hidden = !!options;
      part('other').hidden = !options;
    }

    async function run(work, focusSelector) {
      if (busy) return;
      busy = true;
      part('err').textContent = '';
      el.setAttribute('aria-busy', 'true');
      try {
        await work();
        render();
        if (state) applyLive(state.applied);
        const next = focusSelector && el.querySelector(focusSelector);
        if (next) next.focus();
      } catch (e) {
        part('err').textContent = String((e && e.message) || e);
      } finally {
        busy = false;
        el.removeAttribute('aria-busy');
      }
    }

    const choose = (mode, theme) => run(async () => {
      state = await api('/api/teacher/theme', { method: 'PUT', body: { mode, theme } });
    }, '[aria-pressed="true"]');

    part('choices').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mode]');
      if (b) choose(b.dataset.mode, b.dataset.theme);
    });
    part('other').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.elements.theme;
      const theme = input.value.trim();
      if (theme) choose('picked', theme).then(() => { if (!part('err').textContent) input.value = ''; });
    });
    el.querySelector('[data-act="options"]').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const label = btn.textContent;
      btn.textContent = 'Reading the site’s themes…';
      run(async () => { options = (await api('/api/teacher/theme/options')).options; }, '[data-part="choices"] button')
        .finally(() => { btn.textContent = label; });
    });
    el.querySelector('[data-act="refresh"]').addEventListener('click', () => run(async () => {
      state = await api('/api/teacher/theme/refresh', { method: 'POST', body: {} });
      if (options) options = (await api('/api/teacher/theme/options')).options;
    }));

    return run(async () => { state = await api('/api/teacher/theme'); });
  }

  window.CourseTheme = { mount, applyLive };
})();
