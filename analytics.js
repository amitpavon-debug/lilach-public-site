(() => {
  const ENDPOINT = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/site-analytics-summary";
  const $ = (id) => document.getElementById(id);
  const format = (n) => new Intl.NumberFormat("he-IL").format(Number(n || 0));
  const pct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;

  function row(label, value) {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `<span>${label}</span><strong>${format(value)}</strong>`;
    return div;
  }

  function fillRows(id, items) {
    const host = $(id);
    host.innerHTML = "";
    for (const [label, value] of items) host.appendChild(row(label, value));
  }

  async function load() {
    try {
      const response = await fetch(ENDPOINT, { headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "load_failed");

      const s = data.summary || {};
      $("todayVisits").textContent = format(s.todayVisits);
      $("monthVisits").textContent = format(s.last30Visits);
      $("monthRequests").textContent = format(s.last30BookingRequests);
      $("monthConfirmed").textContent = format(s.last30Confirmed);
      $("visitorRate").textContent = pct(s.visitorToRequestRate);
      $("confirmRate").textContent = pct(s.requestToConfirmedRate);
      $("weekVisits").textContent = format(s.last7Visits);
      $("totalVisits").textContent = format(s.totalVisits);

      const days = data.last30Days || [];
      const max = Math.max(1, ...days.flatMap(d => [Number(d.visits||0), Number(d.bookingRequests||0), Number(d.confirmed||0)]));
      const chart = $("chart");
      chart.innerHTML = "";
      for (const d of days) {
        const day = document.createElement("div");
        day.className = "bar-day";
        const bars = document.createElement("div");
        bars.className = "bars";
        for (const [cls, val] of [["visit", d.visits], ["request", d.bookingRequests], ["confirmed", d.confirmed]]) {
          const b = document.createElement("i");
          b.className = `bar ${cls}`;
          b.title = `${d.date}: ${val}`;
          b.style.height = `${Math.max(1, Math.round((Number(val||0)/max)*180))}px`;
          bars.appendChild(b);
        }
        const label = document.createElement("span");
        label.className = "day";
        label.textContent = String(d.date || "").slice(5);
        day.append(bars, label);
        chart.appendChild(day);
      }

      const b = data.bookingsLast30 || {};
      const t = b.appointmentTypes || {};
      const m = b.meetingModes || {};
      const st = b.statuses || {};
      fillRows("types", [["אינטייק ראשוני", t.intake || 0], ["טיפול רגשי", t.therapy || 0], ["ישן / לא מסווג", t.unknown || 0]]);
      fillRows("modes", [["בקליניקה", m.clinic || 0], ["Zoom", m.zoom || 0], ["לא מסווג", m.unknown || 0]]);
      const labels = {
        awaiting_approval: "ממתין לאישור",
        confirmed: "מאושר",
        rejected: "נדחה",
        cancelled: "בוטל ע״י הלקוח",
        cancelled_by_lilach: "בוטל ע״י לילך",
        pending_payment: "ממתין לתשלום",
        expired: "פג תוקף"
      };
      fillRows("statuses", Object.entries(st).sort((a,b)=>Number(b[1])-Number(a[1])).map(([k,v]) => [labels[k] || k, v]));

      $("loading").hidden = true;
      $("dashboard").hidden = false;
    } catch (error) {
      console.error(error);
      $("loading").hidden = true;
      $("error").hidden = false;
    }
  }

  load();
})();