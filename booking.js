/* ============================================================================
   FasalRaah - Farmer Vehicle Booking (Step Wizard + My Bookings)
   Self-contained module. Does not touch script.js or the Officer page.
   Uses the same Supabase REST pattern as script.js (anon/publishable key).
   ============================================================================ */

(function () {
  "use strict";

  const SUPABASE_URL = "https://kendqopvsmwuihvvjrte.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Dtdfdl0ZWFnHLg4rtht7nw_rhQzt376";

  // Same hardcoded demo identity script.js already uses app-wide.
  // There is no real login/auth session yet, so we look the farmer up
  // by mobile number, exactly like the existing dashboard sync does.
  const DEMO_MOBILE_NUMBER = "9876543210";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function formatINR(num) {
    num = Math.max(0, Math.round(Number(num) || 0));
    const str = String(num);
    const last3 = str.slice(-3);
    const rest = str.slice(0, -3);
    return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  }

  function toast(msg) {
    if (typeof window.showToast === "function") {
      window.showToast(msg);
      return;
    }
    const container = $("#toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = "toast is-visible";
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ---- Supabase REST helper -------------------------------------------
  async function sb(method, table, { query = "", body = null, prefer = null } = {}) {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    };
    if (prefer) headers["Prefer"] = prefer;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch (e) {
        /* ignore */
      }
      throw new Error(
        `${method} ${table} failed (${res.status}). ${detail || "Check Supabase RLS policies allow this for the anon role."}`
      );
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined || isNaN(v))) return null;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ---- Trip status → simple farmer-facing label ------------------------
  // procurement DB has no literal "booked" value in trip_status, so we
  // insert as 'requested' and present that as "Booked" to match the
  // simple flow the farmer should see.
  const STATUS_LABELS = {
    requested: { label: "Booked", icon: "🟡", step: 0 },
    driver_assigned: { label: "Driver Assigned", icon: "🟠", step: 1 },
    vehicle_coming: { label: "On the Way", icon: "🚚", step: 2 },
    arrived_at_farm: { label: "On the Way", icon: "🚚", step: 2 },
    crop_loaded: { label: "On the Way", icon: "🚚", step: 2 },
    en_route_mandi: { label: "Arrived", icon: "📍", step: 3 },
    arrived_at_centre: { label: "Arrived", icon: "📍", step: 3 },
    completed: { label: "Completed", icon: "🟢", step: 4 },
    cancelled: { label: "Cancelled", icon: "⚪", step: -1 }
  };

  // ---- State -------------------------------------------------------------
  const state = {
    farmerId: null,
    farmerName: "",
    crops: [],
    centres: [],
    vehicles: [],
    crop: null,
    quantity: null,
    pickup: { address: "", village: "", district: "", pincode: "", lat: null, lng: null },
    centre: null,
    vehicle: null,
    distanceKm: null,
    fare: null
  };

  const STEP_ORDER = ["crop", "quantity", "pickup", "centre", "vehicle", "summary"];
  let stepIndex = 0;

  // ---- Data loading --------------------------------------------------
  async function loadFarmerIdentity() {
    const rows = await sb("GET", "profiles", {
      query: `mobile_number=eq.${DEMO_MOBILE_NUMBER}&select=id,full_name`
    });
    if (rows && rows[0]) {
      state.farmerId = rows[0].id;
      state.farmerName = rows[0].full_name;
    }
  }

  async function loadCrops() {
    const rows = await sb("GET", "crop_prices", {
      query: "is_active=eq.true&select=crop_name&order=crop_name.asc"
    });
    state.crops = (rows || []).map((r) => r.crop_name);
  }

  async function loadCentres() {
    const rows = await sb("GET", "procurement_centres", {
      query: "select=*,queue_status(current_queue,avg_service_minutes)&order=name.asc"
    });
    state.centres = rows || [];
  }

  async function loadVehicles() {
    const rows = await sb("GET", "vehicles", {
      query: "is_available=eq.true&select=*&order=vehicle_type.asc"
    });
    state.vehicles = rows || [];
  }

  // ---- Rendering: wizard shell ----------------------------------------
  function stepContainer() {
    return $("#booking-step-content");
  }

  function renderProgress() {
    const wrap = $("#booking-progress");
    if (!wrap) return;
    const labels = ["Crop", "Quantity", "Pickup", "Centre", "Vehicle", "Confirm"];
    wrap.innerHTML = labels
      .map((label, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return `<span class="booking-step-dot${done ? " is-done" : ""}${active ? " is-active" : ""}">${i + 1}. ${label}</span>`;
      })
      .join("");
  }

  function setNavButtons({ backVisible = true, nextLabel = "Next", nextDisabled = false } = {}) {
    const backBtn = $("#booking-back-btn");
    const nextBtn = $("#booking-next-btn");
    if (backBtn) backBtn.style.visibility = backVisible ? "visible" : "hidden";
    if (nextBtn) {
      nextBtn.textContent = nextLabel;
      nextBtn.disabled = nextDisabled;
    }
  }

  function goToStep(index) {
    stepIndex = Math.max(0, Math.min(STEP_ORDER.length - 1, index));
    renderProgress();
    renderStep();
  }

  function renderStep() {
    const name = STEP_ORDER[stepIndex];
    if (name === "crop") renderCropStep();
    else if (name === "quantity") renderQuantityStep();
    else if (name === "pickup") renderPickupStep();
    else if (name === "centre") renderCentreStep();
    else if (name === "vehicle") renderVehicleStep();
    else if (name === "summary") renderSummaryStep();
  }

  // ---- Step 1: Crop -----------------------------------------------------
  function renderCropStep() {
    const options = state.crops.length
      ? state.crops.map((c) => `<option value="${c}" ${state.crop === c ? "selected" : ""}>${c}</option>`).join("")
      : `<option value="">No crops found in crop_prices</option>`;

    stepContainer().innerHTML = `
      <p class="field-label" style="font-size:17px; margin-top:0;">What crop do you want to transport?</p>
      <select class="field-input" id="input-crop">
        <option value="" ${state.crop ? "" : "selected"} disabled>Select a crop</option>
        ${options}
      </select>
    `;
    $("#input-crop").addEventListener("change", (e) => {
      state.crop = e.target.value || null;
      setNavButtons({ backVisible: false, nextDisabled: !state.crop });
    });
    setNavButtons({ backVisible: false, nextDisabled: !state.crop });
  }

  // ---- Step 2: Quantity --------------------------------------------------
  function renderQuantityStep() {
    stepContainer().innerHTML = `
      <p class="field-label" style="font-size:17px; margin-top:0;">How much crop do you want to transport?</p>
      <div style="display:flex; gap:10px; align-items:flex-end;">
        <div style="flex:1;">
          <label class="field-label" for="input-qty">Quantity</label>
          <input class="field-input" type="number" id="input-qty" min="1" step="0.1" value="${state.quantity ?? ""}" placeholder="e.g. 50" />
        </div>
        <div style="padding-bottom:10px; font-weight:600; color:var(--ink-soft);">Quintals</div>
      </div>
      <p class="field-error" id="qty-error" style="display:none;">Please enter a quantity greater than 0.</p>
    `;
    const input = $("#input-qty");
    const err = $("#qty-error");
    input.addEventListener("input", () => {
      const val = parseFloat(input.value);
      const valid = !isNaN(val) && val > 0;
      state.quantity = valid ? val : null;
      err.style.display = valid || input.value === "" ? "none" : "block";
      setNavButtons({ nextDisabled: !valid });
    });
    setNavButtons({ nextDisabled: !(state.quantity > 0) });
  }

  // ---- Step 3: Pickup address --------------------------------------------
  function renderPickupStep() {
    const p = state.pickup;
    stepContainer().innerHTML = `
      <p class="field-label" style="font-size:17px; margin-top:0;">Where should we pick up your crop?</p>

      <label class="field-label" for="input-address">Pickup Address</label>
      <input class="field-input" type="text" id="input-address" value="${p.address}" placeholder="House / Street" />

      <label class="field-label" for="input-village">Village</label>
      <input class="field-input" type="text" id="input-village" value="${p.village}" placeholder="Village" />

      <label class="field-label" for="input-district">District</label>
      <input class="field-input" type="text" id="input-district" value="${p.district}" placeholder="District" />

      <label class="field-label" for="input-pincode">Pincode</label>
      <input class="field-input" type="text" id="input-pincode" value="${p.pincode}" placeholder="Pincode" inputmode="numeric" />

      <button type="button" id="use-location-btn" class="btn btn-secondary btn-small" style="margin-top:14px;">📍 Use Current Location</button>
      <p class="qr-caption" id="location-status" style="margin-top:6px;">${p.lat ? `Location captured (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})` : "Optional — manual address entry always works."}</p>

      <p class="field-error" id="pickup-error" style="display:none;">Please fill in address, village and district.</p>
    `;

    const check = () => {
      const valid = p.address && p.village && p.district;
      setNavButtons({ nextDisabled: !valid });
      return valid;
    };

    ["address", "village", "district", "pincode"].forEach((key) => {
      $(`#input-${key}`).addEventListener("input", (e) => {
        p[key] = e.target.value.trim();
        $("#pickup-error").style.display = "none";
        check();
      });
    });

    $("#use-location-btn").addEventListener("click", () => {
      if (!("geolocation" in navigator)) {
        toast("Location isn't available on this browser. Please enter the address manually.");
        return;
      }
      const statusEl = $("#location-status");
      statusEl.textContent = "Getting your location…";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          p.lat = pos.coords.latitude;
          p.lng = pos.coords.longitude;
          statusEl.textContent = `Location captured (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`;
        },
        () => {
          statusEl.textContent = "Couldn't get location — manual entry still works fine.";
        },
        { timeout: 8000 }
      );
    });

    check();
  }

  // ---- Step 4: Procurement centre ---------------------------------------
  function renderCentreStep() {
    if (!state.centres.length) {
      stepContainer().innerHTML = `<p>No procurement centres found.</p>`;
      setNavButtons({ nextDisabled: true });
      return;
    }

    stepContainer().innerHTML = `
      <p class="field-label" style="font-size:17px; margin-top:0;">Where should we deliver your crop?</p>
      <div class="vehicle-list" id="centre-cards"></div>
    `;

    const wrap = $("#centre-cards");
    state.centres.forEach((c) => {
      const q = (c.queue_status && c.queue_status[0]) || null;
      const queueCount = q ? q.current_queue : null;
      const waitMins = q ? Math.round((q.current_queue || 0) * (q.avg_service_minutes || 0)) : null;
      const isOpen = (c.status || "").toLowerCase() === "open";
      const selected = state.centre && state.centre.id === c.id;

      const card = document.createElement("div");
      card.className = "card vehicle-card" + (selected ? "" : "");
      card.style.cursor = "pointer";
      card.style.outline = selected ? "3px solid var(--wheat-deep)" : "none";
      card.innerHTML = `
        <p class="vehicle-name">${c.name}</p>
        <p class="vehicle-rating">${c.address || `${c.district}, ${c.state}`}</p>
        <div class="vehicle-meta-grid">
          <span>Status: <strong>${c.status || "Unknown"}</strong></span>
          <span>Queue: <strong>${queueCount ?? "—"}</strong></span>
          <span>Est. Wait: <strong>${waitMins !== null ? waitMins + " mins" : "—"}</strong></span>
          <span>Gates: <strong>${c.total_gates ?? "—"}</strong></span>
        </div>
        <span class="status-badge ${isOpen ? "badge-open" : "badge-alert"}">${isOpen ? "Open" : "Closed"}</span>
        <button type="button" class="btn btn-primary btn-small" ${isOpen ? "" : "disabled"}>${selected ? "Selected" : "Select Centre"}</button>
      `;
      card.querySelector("button").addEventListener("click", () => {
        if (!isOpen) return;
        state.centre = c;
        renderCentreStep();
        setNavButtons({ nextDisabled: false });
      });
      wrap.appendChild(card);
    });

    setNavButtons({ nextDisabled: !state.centre });
  }

  // ---- Step 5: Vehicle ----------------------------------------------------
  function renderVehicleStep() {
    if (!state.vehicles.length) {
      stepContainer().innerHTML = `<p>No vehicles are currently available.</p>`;
      setNavButtons({ nextDisabled: true });
      return;
    }

    // distance: real if we have farmer geo + centre geo, else a reasonable estimate
    const centre = state.centre;
    const geoDist = state.pickup.lat && centre && centre.latitude
      ? haversineKm(state.pickup.lat, state.pickup.lng, centre.latitude, centre.longitude)
      : null;
    state.distanceKm = geoDist !== null ? Math.round(geoDist * 10) / 10 : 6.4; // 6.4km fallback matches existing demo data

    stepContainer().innerHTML = `
      <p class="field-label" style="font-size:17px; margin-top:0;">Select a vehicle</p>
      <p class="section-subtitle" style="margin-bottom:14px;">Estimated distance to centre: ${state.distanceKm} km${geoDist === null ? " (estimate)" : ""}</p>
      <div class="vehicle-list" id="vehicle-cards"></div>
    `;

    const wrap = $("#vehicle-cards");
    state.vehicles.forEach((v) => {
      const capOk = Number(v.capacity_quintals) >= Number(state.quantity || 0);
      const fare = Math.round((Number(v.base_rate) || 0) + (Number(v.per_km_rate) || 0) * state.distanceKm);
      const selected = state.vehicle && state.vehicle.id === v.id;

      const card = document.createElement("div");
      card.className = "card vehicle-card";
      card.style.outline = selected ? "3px solid var(--wheat-deep)" : "none";
      card.innerHTML = `
        <div class="vehicle-head">
          <span class="vehicle-icon">🚚</span>
          <div>
            <p class="vehicle-name">${v.vehicle_type}</p>
            <span class="vehicle-rating">${v.license_plate} · ${v.driver_name}${v.rating ? " · ★" + v.rating : ""}</span>
          </div>
        </div>
        <div class="vehicle-meta-grid">
          <span>Capacity: <strong>${v.capacity_quintals} q</strong></span>
          <span>Est. Fare: <strong>₹${formatINR(fare)}</strong></span>
          <span>Driver: <strong>${v.driver_name}</strong></span>
          <span>Phone: <strong>${v.driver_phone}</strong></span>
        </div>
        ${capOk
          ? `<span class="status-badge badge-open">Available</span>`
          : `<span class="status-badge badge-alert">Insufficient capacity</span>`}
        <button type="button" class="btn btn-primary btn-small" ${capOk ? "" : "disabled"}>${selected ? "Selected" : "Select Vehicle"}</button>
      `;
      card.querySelector("button").addEventListener("click", () => {
        if (!capOk) return;
        state.vehicle = v;
        state.fare = fare;
        renderVehicleStep();
        setNavButtons({ nextDisabled: false });
      });
      wrap.appendChild(card);
    });

    setNavButtons({ nextDisabled: !state.vehicle });
  }

  // ---- Step 6: Summary + Confirm -----------------------------------------
  function composePickupAddress() {
    const p = state.pickup;
    let text = `${p.address}, ${p.village}, ${p.district}`;
    if (p.pincode) text += ` - ${p.pincode}`;
    if (p.lat && p.lng) text += ` (GPS: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;
    return text;
  }

  function renderSummaryStep() {
    const p = state.pickup;
    stepContainer().innerHTML = `
      <p class="field-label" style="font-size:17px; margin-top:0;">Booking Summary</p>
      <div class="card token-card">
        <div class="token-details">
          <div class="token-row"><span>Crop</span><strong>${state.crop}</strong></div>
          <div class="token-row"><span>Quantity</span><strong>${state.quantity} Quintals</strong></div>
          <div class="token-row"><span>Pickup Address</span><strong style="text-align:right; max-width:60%;">${p.village}, ${p.district}</strong></div>
          <div class="token-row"><span>Destination</span><strong>${state.centre.name}</strong></div>
          <div class="token-row"><span>Vehicle</span><strong>${state.vehicle.vehicle_type} — ${state.vehicle.license_plate}</strong></div>
          <div class="token-row"><span>Estimated Fare</span><strong style="color:var(--wheat-deep);">₹${formatINR(state.fare)}</strong></div>
        </div>
      </div>
      <p class="field-error" id="confirm-error" style="display:none;"></p>
    `;
    setNavButtons({ nextLabel: "CONFIRM & BOOK VEHICLE", nextDisabled: false });
  }

  // ---- Confirm & Book (real Supabase writes) ------------------------------
  async function confirmBooking() {
    if (!state.farmerId) {
      throw new Error("Could not identify farmer profile. Check that a profiles row exists for mobile_number " + DEMO_MOBILE_NUMBER + ".");
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    const centreTag = (state.centre.name || "CTR").split(" ")[0].slice(0, 3).toUpperCase();
    const tokenNumber = `PB-${centreTag}-${Math.floor(100 + Math.random() * 900)}`;

    // 1. procurement_tokens
    const tokenRows = await sb("POST", "procurement_tokens", {
      body: {
        token_number: tokenNumber,
        farmer_id: state.farmerId,
        centre_id: state.centre.id,
        crop_name: state.crop,
        quantity_quintals: state.quantity,
        slot_date: todayISO,
        slot_time_window: "Walk-in",
        status: "scheduled"
      },
      prefer: "return=representation"
    });
    const token = tokenRows && tokenRows[0];
    if (!token) throw new Error("procurement_tokens insert returned no row.");

    // 2. transport_bookings, linked via token_id
    const bookingCode = `FR-${Date.now().toString().slice(-6)}`;
    const bookingRows = await sb("POST", "transport_bookings", {
      body: {
        booking_code: bookingCode,
        farmer_id: state.farmerId,
        vehicle_id: state.vehicle.id,
        token_id: token.id,
        pickup_location: composePickupAddress(),
        destination_centre_id: state.centre.id,
        fare_amount: state.fare,
        distance_km: state.distanceKm,
        eta_minutes: 20,
        status: "requested"
      },
      prefer: "return=representation"
    });
    const booking = bookingRows && bookingRows[0];
    if (!booking) throw new Error("transport_bookings insert returned no row.");

    return { token, booking };
  }

  function renderSuccessScreen(booking) {
    stepContainer().innerHTML = `
      <div class="card" style="text-align:center;">
        <p style="font-size:22px; font-weight:700; margin-bottom:10px;">✅ Vehicle Booked Successfully</p>
        <p class="qr-caption" style="font-size:14px; margin-bottom:14px;">Booking ID: <strong>${booking.booking_code}</strong></p>
        <div class="token-details" style="text-align:left;">
          <div class="token-row"><span>Crop</span><strong>${state.crop}</strong></div>
          <div class="token-row"><span>Quantity</span><strong>${state.quantity} Quintals</strong></div>
          <div class="token-row"><span>Pickup</span><strong>${state.pickup.village}, ${state.pickup.district}</strong></div>
          <div class="token-row"><span>Destination</span><strong>${state.centre.name}</strong></div>
          <div class="token-row"><span>Vehicle</span><strong>${state.vehicle.vehicle_type}</strong></div>
          <div class="token-row"><span>Fare</span><strong>₹${formatINR(state.fare)}</strong></div>
          <div class="token-row"><span>Status</span><strong>🟡 BOOKED</strong></div>
        </div>
        <button type="button" id="view-booking-btn" class="btn btn-primary" style="margin-top:16px;">View My Booking</button>
      </div>
    `;
    setNavButtons({ backVisible: false, nextLabel: "Done", nextDisabled: false });
    $("#view-booking-btn").addEventListener("click", () => {
      resetWizard();
      document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth" });
      loadMyBookings();
    });
  }

  function resetWizard() {
    $("#booking-entry").hidden = false;
    $("#booking-steps").hidden = true;
    stepIndex = 0;
    state.crop = null;
    state.quantity = null;
    state.pickup = { address: "", village: "", district: "", pincode: "", lat: null, lng: null };
    state.centre = null;
    state.vehicle = null;
    state.fare = null;
  }

  // ---- Wizard navigation wiring ------------------------------------------
  async function startWizard() {
    $("#booking-entry").hidden = true;
    $("#booking-steps").hidden = false;
    stepContainer().innerHTML = `<p class="section-subtitle">Loading…</p>`;
    try {
      const tasks = [];
      if (!state.crops.length) tasks.push(loadCrops());
      if (!state.centres.length) tasks.push(loadCentres());
      if (!state.vehicles.length) tasks.push(loadVehicles());
      if (!state.farmerId) tasks.push(loadFarmerIdentity());
      await Promise.all(tasks);
    } catch (err) {
      console.error(err);
      stepContainer().innerHTML = `<p class="field-error">Couldn't load booking data: ${err.message}</p>`;
      return;
    }
    goToStep(0);
  }

  function bindWizardNav() {
    $("#booking-back-btn").addEventListener("click", () => {
      if (stepIndex === 0) {
        resetWizard();
        return;
      }
      goToStep(stepIndex - 1);
    });

    $("#booking-next-btn").addEventListener("click", async () => {
      const isLastStep = STEP_ORDER[stepIndex] === "summary";
      if (!isLastStep) {
        goToStep(stepIndex + 1);
        return;
      }
      // Confirm & Book
      const btn = $("#booking-next-btn");
      const errEl = $("#confirm-error");
      btn.disabled = true;
      btn.textContent = "Booking…";
      try {
        const { booking } = await confirmBooking();
        toast("🌾 Vehicle booked! Booking ID " + booking.booking_code);
        renderSuccessScreen(booking);
      } catch (err) {
        console.error(err);
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Booking failed: " + err.message;
        }
        btn.disabled = false;
        btn.textContent = "CONFIRM & BOOK VEHICLE";
      }
    });
  }

  // ---- My Bookings section ------------------------------------------------
  async function loadMyBookings() {
    const listEl = $("#my-bookings-list");
    if (!listEl) return;
    listEl.innerHTML = `<p class="section-subtitle">Loading your bookings…</p>`;

    try {
      if (!state.farmerId) await loadFarmerIdentity();
      if (!state.farmerId) {
        listEl.innerHTML = `<p class="field-error">Could not identify farmer profile.</p>`;
        return;
      }

      const rows = await sb("GET", "transport_bookings", {
        query: `farmer_id=eq.${state.farmerId}&select=*,vehicles(*),procurement_tokens(*),destination:procurement_centres!destination_centre_id(*)&order=created_at.desc`
      });

      if (!rows || !rows.length) {
        listEl.innerHTML = `<p class="section-subtitle">No bookings yet. Book a vehicle above to see it here.</p>`;
        return;
      }

      listEl.innerHTML = "";
      rows.forEach((b) => {
        const statusInfo = STATUS_LABELS[b.status] || { label: b.status, icon: "•" };
        const token = b.procurement_tokens;
        const centre = b.destination;
        const vehicle = b.vehicles;

        const card = document.createElement("div");
        card.className = "card tracking-card";
        card.innerHTML = `
          <div class="tracking-meta-grid">
            <div><span class="summary-label">Booking ID</span><span class="summary-value">${b.booking_code}</span></div>
            <div><span class="summary-label">Crop</span><span class="summary-value">${token ? token.crop_name : "—"}</span></div>
            <div><span class="summary-label">Quantity</span><span class="summary-value">${token ? token.quantity_quintals + " q" : "—"}</span></div>
            <div><span class="summary-label">Pickup</span><span class="summary-value">${b.pickup_location}</span></div>
            <div><span class="summary-label">Centre</span><span class="summary-value">${centre ? centre.name : "—"}</span></div>
            <div><span class="summary-label">Vehicle</span><span class="summary-value">${vehicle ? vehicle.vehicle_type : "—"}</span></div>
            <div><span class="summary-label">Fare</span><span class="summary-value">₹${formatINR(b.fare_amount)}</span></div>
            <div><span class="summary-label">Status</span><span class="status-badge badge-moderate">${statusInfo.icon} ${statusInfo.label}</span></div>
          </div>
        `;
        listEl.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<p class="field-error">Couldn't load bookings: ${err.message}</p>`;
    }
  }

  // ---- Init ---------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const startBtn = $("#start-booking-btn");
    if (startBtn) startBtn.addEventListener("click", startWizard);

    if ($("#booking-next-btn")) bindWizardNav();

    loadMyBookings();
  });

  // expose for the "View My Booking" flow / manual refresh
  window.FasalRaahBooking = { loadMyBookings };
})();