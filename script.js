/* ============================================================================
   FasalRaah - Live Supabase Cloud Integration (Farmer + Officer Dual Role)
   ============================================================================ */

const SUPABASE_URL = "https://kendqopvsmwuihvvjrte.supabase.co";
const SUPABASE_KEY = "sb_publishable_Dtdfdl0ZWFnHLg4rtht7nw_rhQzt376";

// Direct REST Fetch Helper
async function fetchSupabase(table, query = "") {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error(`[FasalRaah] Error fetching ${table}:`, err);
    return null;
  }
}

// Helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function formatINR(num) {
  num = Math.max(0, Math.round(num));
  const str = String(num);
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
}

function showToast(msg) {
  const container = $("#toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast is-visible";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ============================================================================
// MAIN LIVE DATA SYNC
// ============================================================================
async function loadFasalRaahFromSupabase() {
  console.log("[FasalRaah] Connecting to Supabase Cloud...");

  // 1. Fetch Farmer Profile (Gurpreet Singh)
  const profiles = await fetchSupabase("profiles", "mobile_number=eq.9876543210");
  if (profiles && profiles.length > 0) {
    const farmer = profiles[0];
    if ($(".greeting-name")) $(".greeting-name").textContent = `${farmer.full_name.split(" ")[0]} 🙏`;
    if ($(".profile-name")) $(".profile-name").textContent = farmer.full_name;
    if ($(".profile-sub")) $(".profile-sub").textContent = `${farmer.village_town}, ${farmer.primary_crop} farmer`;
  }

  // 2. Fetch Tokens & Calculate Live Queue
  const tokens = await fetchSupabase("procurement_tokens", "order=token_number.asc");
  if (tokens && tokens.length >= 2) {
    const serving = tokens[0]; // PB-KHN-081
    const mine = tokens[1];    // PB-KHN-099

    $$(".token-value").forEach(el => el.textContent = mine.token_number);
    const servingBox = $(".queue-token-box:first-child .queue-token-amount");
    if (servingBox) servingBox.textContent = serving.token_number;
    const myBox = $(".queue-token-box-you .queue-token-amount");
    if (myBox) myBox.textContent = mine.token_number;

    // Queue Calculation (18 * 2.5 = 45 mins)
    const numServing = parseInt(serving.token_number.split("-")[2], 10) || 81;
    const numMine = parseInt(mine.token_number.split("-")[2], 10) || 99;
    const farmersAhead = Math.max(0, numMine - numServing);
    const waitMinutes = Math.round(farmersAhead * 2.5);

    if ($("#queue-progress-caption")) $("#queue-progress-caption").textContent = `${farmersAhead} farmers ahead of you`;
    if ($("#queue-wait-value")) $("#queue-wait-value").textContent = `${waitMinutes} minutes`;
    if ($(".stat-value")) $(".stat-value").textContent = `${waitMinutes} mins`;
  }

  // 3. Fetch Official MSP Rates
  const prices = await fetchSupabase("crop_prices", "order=msp_rate.desc");
  if (prices && prices.length > 0) {
    const paddy = prices.find(p => p.crop_name.includes("Paddy")) || prices[0];
    if ($(".price-strip strong")) $(".price-strip strong").textContent = `₹${formatINR(paddy.msp_rate)} / quintal`;

    const calcQty = $("#calc-qty");
    const calcVal = $("#calc-value");
    if (calcQty && calcVal) {
      calcQty.value = 20;
      const updateCalc = () => {
        const qty = Number(calcQty.value) || 0;
        calcVal.textContent = `₹${formatINR(qty * paddy.msp_rate)}`;
      };
      calcQty.addEventListener("input", updateCalc);
      updateCalc();
    }
  }

  // 4. Fetch Transport Booking
  const bookings = await fetchSupabase("transport_bookings", "booking_code=eq.FR-BK-2024-01");
  if (bookings && bookings.length > 0) {
    const b = bookings[0];
    if ($("#tracking-booking-id")) $("#tracking-booking-id").textContent = b.booking_code;
    if ($("#tracking-vehicle")) $("#tracking-vehicle").textContent = "Tractor + Trolley, PB 10 ER 4120";
    if ($("#tracking-driver")) $("#tracking-driver").textContent = "Sukhdev Singh (4.8★ rating)";
    if ($("#tracking-eta")) $("#tracking-eta").textContent = `${b.eta_minutes} minutes`;
    if ($("#tracking-distance")) $("#tracking-distance").textContent = `${b.distance_km} km`;
    if ($("#tracking-fare")) $("#tracking-fare").textContent = `₹${formatINR(b.fare_amount)}`;
  }

  // 5. Fetch DBT Payment
  const payments = await fetchSupabase("payments", "transaction_id=eq.PFMS-DBT-992147");
  if (payments && payments.length > 0) {
    if ($(".payment-amount")) $(".payment-amount").textContent = `₹${formatINR(payments[0].amount)}`;
  }

  showToast("🌾 Live data synced with Supabase Cloud!");
}

// ============================================================================
// DUAL-ROLE LOGIN HANDLER (Farmer vs Officer)
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  loadFasalRaahFromSupabase();

  const mobileInput = $("#mobile-number");
  const continueBtn = $("#continue-btn");
  const roleRadios = $$('input[name="role"]');

  // Auto-fill mobile number based on chosen role
  roleRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.value === "officer") {
        mobileInput.value = "9814011223"; // Harbhajan Singh (Officer)
        continueBtn.setAttribute("href", "#officer-dashboard");
      } else {
        mobileInput.value = "9876543210"; // Gurpreet Singh (Farmer)
        continueBtn.setAttribute("href", "#dashboard");
      }
    });
  });

  // Login action
  if (continueBtn && mobileInput) {
    continueBtn.addEventListener("click", (e) => {
      const selectedRole = $('input[name="role"]:checked')?.value || "farmer";
      
      if (selectedRole === "officer") {
        continueBtn.setAttribute("href", "#officer-dashboard");
        showToast("Logged in as Mandi Officer (Harbhajan Singh)");
      } else {
        continueBtn.setAttribute("href", "#dashboard");
        showToast("Welcome back, Gurpreet Singh!");
      }
    });
  }

  // Accessibility switches
  const setupSwitch = (id, className) => {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const on = btn.classList.toggle("is-on");
      document.body.classList.toggle(className, on);
      btn.setAttribute("aria-checked", String(on));
    });
  };
  setupSwitch("#toggle-large-text", "large-text");
  setupSwitch("#toggle-contrast", "high-contrast");
});

function booked(){
    alert("Vehicle Booked")
}
// Web Speech: Read active screen
const readBtn = $("#read-aloud-btn");
if (readBtn && "speechSynthesis" in window) {
  readBtn.addEventListener("click", () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      readBtn.textContent = "🔊 Listen";
      return;
    }

    const currentScreen = $$(".screen").find((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight / 2;
    }) || $(".screen");

    if (!currentScreen) return;

    const utterance = new SpeechSynthesisUtterance(currentScreen.innerText);
    utterance.lang = langSelect?.value === "hi" ? "hi-IN" : "en-IN";
    utterance.onend = () => { readBtn.textContent = "🔊 Listen"; };

    window.speechSynthesis.speak(utterance);
    readBtn.textContent = "⏹ Stop";
  });
}

// Navigation highlight via IntersectionObserver
const navLinks = $$(".bottom-nav a");
const sections = navLinks.map((l) => $(l.getAttribute("href"))).filter(Boolean);

if (sections.length && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = `#${entry.target.id}`;
          navLinks.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === id));
        }
      });
    },
    { rootMargin: "-40% 0px -40% 0px" }
  );
  sections.forEach((sec) => observer.observe(sec));
}

/* ==========================================================================
   FasalRaah – Language switcher + Read-aloud (Speech Synthesis)
   Supports: English (en), Hindi (hi), Punjabi (pa)
   ========================================================================== */

(function () {
  "use strict";

  // ---- 1. TRANSLATIONS -----------------------------------------------
  const translations = {
    en: {
      nav_logout: "Log Out",
      dash_greeting: "Good morning,",
      dash_sync: "🔄 Live synced with Supabase",
      label_procurement_centre: "Procurement Centre",
      label_assigned_gate: "Assigned Gate",
      value_gate_2: "Gate 2",
      label_token_id: "Token ID",
      label_crop: "Crop",
      value_crop_paddy: "🌾 Paddy (Common)",
      value_crop_paddy_full: "Paddy (Common, PR-126)",
      label_quantity: "Quantity",
      value_quantity_20: "20 quintals",
      label_schedule_slot: "Schedule Slot",
      value_schedule: "Today, 10:00 AM–12:00 PM",
      label_recommended_arrival: "Recommended arrival",
      label_crowd_level: "Crowd level",
      badge_moderate: "Moderate",
      label_estimated_wait: "Estimated wait",
      value_wait_45mins: "45 mins",
      value_wait_45minutes: "45 minutes",
      label_msp_paddy: "Official GOI MSP for Paddy",
      value_msp_price: "₹2,300 / quintal",
      title_go_now: "Should I Go Now?",
      demo_label_telemetry: "Smart Mandi Telemetry Advisory",
      go_now_main: "Leave at 09:15 AM",
      label_expected_arrival: "Expected arrival",
      label_weighbridge_slot: "Weighbridge slot",
      go_now_explain: "Based on 18 farmers ahead of token PB-KHN-099 and a 25-minute travel time from Daudpur Village, leaving at 09:15 AM gets you to Gate 2 right on schedule without yard idling.",
      title_token_pass: "Procurement Token Pass",
      label_centre: "Centre",
      label_slot: "Slot",
      label_gate: "Gate",
      label_token: "Token",
      qr_caption: "Scan at Gate 2 Weighbridge",
      title_queue: "Live Gate 2 Queue",
      label_currently_serving: "Currently serving",
      label_your_token: "Your token",
      queue_caption: "18 farmers ahead of you",
      label_processing_rate: "Processing rate",
      value_processing_rate: "2.5 mins / trolley",
      label_gate_status: "Gate status",
      badge_open: "Open",
      title_msp_calc: "Official MSP & Calculator",
      subtitle_msp_calc: "MSP Payout Calculator",
      label_qty_quintals: "Quantity (quintals)",
      label_estimated_value: "Estimated Value at MSP (₹2,300/q)",
      title_booking: "Book Farm Pickup",
      subtitle_booking: "Verified local logistics partners",
      veh_name_tractor: "Tractor Trolley",
      veh_cap_60: "Cap: 60 quintals",
      veh_eta_20: "ETA: ~20 mins",
      veh_dist_64: "Dist: 6.4 km",
      veh_fare_850: "Est. Fare: ₹850",
      badge_available: "Available",
      btn_book_vehicle: "Book Vehicle",
      veh_name_minitruck: "Mini Truck (Bolero/Ace)",
      veh_cap_100: "Cap: 100 quintals",
      veh_eta_28: "ETA: ~28 mins",
      veh_fare_1450: "Est. Fare: ₹1,450",
      badge_high_demand: "High Demand",
      veh_name_lcv: "LCV (Light Vehicle)",
      veh_cap_40: "Cap: 40 quintals",
      veh_eta_15: "ETA: ~15 mins",
      veh_fare_650: "Est. Fare: ₹650",
      title_tracking: "Assigned Transport",
      label_booking_id: "Booking ID",
      label_vehicle: "Vehicle",
      label_driver: "Driver",
      label_eta_farm: "ETA to Farm",
      value_15min: "15 minutes",
      label_distance: "Distance",
      value_dist_72: "7.2 km",
      label_total_fare: "Total Fare",
      map_caption: "📍 Driver Sukhdev Singh is en route to Daudpur Farm",
      title_payment: "DBT Payout Status",
      label_total_payable: "Total Payable",
      badge_processing: "Processing",
      label_weighed_quantity: "Weighed Quantity",
      label_rate: "Rate",
      label_bank_account: "Bank Account",
      label_reference: "Reference",
      title_profile: "Farmer Profile",
      profile_sub: "Daudpur Village, Ludhiana • Paddy Producer",
      label_language: "Language",
      toggle_large_text: "Large text",
      toggle_high_contrast: "High contrast",
      toggle_read_aloud: "Read aloud",
      btn_read_screen: "🔊 Read this screen",
      label_low_connectivity: "📶 Low connectivity mode",
      sync_caption: "Last synced: 9:42 AM · Available offline",
      nav_home: "Home",
      nav_go_now: "Go Now?",
      nav_queue: "Queue",
      nav_transport: "Transport",
      nav_payment: "Payment",
      lang_switch_announce: "Language changed to English",
      btn_book_slot: "Book Slot",
      slot_booked_status: "✅ Slot booked for Gate 2, 10:00 AM",
      toast_slot_booked: "Your slot has been booked for Gate 2, 10:00 AM.",
      toast_slot_already: "Your slot is already booked.",
      voice_cmd_aria: "Voice command",
      voice_listening: "Listening… say “book the slot”",
      voice_not_supported: "Voice commands aren't supported in this browser. Try Chrome.",
      voice_not_recognized: "Didn't catch a command. Try saying “book the slot”.",
      no_voice_available: "No {lang} voice installed on this device — playing with default voice."
    },

    hi: {
      nav_logout: "लॉग आउट",
      dash_greeting: "सुप्रभात,",
      dash_sync: "🔄 Supabase से लाइव सिंक",
      label_procurement_centre: "खरीद केंद्र",
      label_assigned_gate: "निर्धारित गेट",
      value_gate_2: "गेट 2",
      label_token_id: "टोकन आईडी",
      label_crop: "फसल",
      value_crop_paddy: "🌾 धान (सामान्य)",
      value_crop_paddy_full: "धान (सामान्य, PR-126)",
      label_quantity: "मात्रा",
      value_quantity_20: "20 क्विंटल",
      label_schedule_slot: "समय स्लॉट",
      value_schedule: "आज, सुबह 10:00 – दोपहर 12:00",
      label_recommended_arrival: "सुझाया गया आगमन समय",
      label_crowd_level: "भीड़ का स्तर",
      badge_moderate: "मध्यम",
      label_estimated_wait: "अनुमानित प्रतीक्षा समय",
      value_wait_45mins: "45 मिनट",
      value_wait_45minutes: "45 मिनट",
      label_msp_paddy: "धान के लिए आधिकारिक MSP",
      value_msp_price: "₹2,300 / क्विंटल",
      title_go_now: "क्या अभी जाना चाहिए?",
      demo_label_telemetry: "स्मार्ट मंडी टेलीमेट्री सलाह",
      go_now_main: "सुबह 09:15 बजे निकलें",
      label_expected_arrival: "अनुमानित आगमन",
      label_weighbridge_slot: "वेटब्रिज स्लॉट",
      go_now_explain: "टोकन PB-KHN-099 से पहले 18 किसान हैं और दौदपुर गांव से 25 मिनट की यात्रा का समय है, इसलिए सुबह 09:15 बजे निकलने पर आप बिना इंतज़ार किए समय पर गेट 2 पहुँच जाएंगे।",
      title_token_pass: "खरीद टोकन पास",
      label_centre: "केंद्र",
      label_slot: "स्लॉट",
      label_gate: "गेट",
      label_token: "टोकन",
      qr_caption: "गेट 2 वेटब्रिज पर स्कैन करें",
      title_queue: "गेट 2 की लाइव कतार",
      label_currently_serving: "अभी सेवा में",
      label_your_token: "आपका टोकन",
      queue_caption: "आपसे पहले 18 किसान हैं",
      label_processing_rate: "प्रसंस्करण दर",
      value_processing_rate: "2.5 मिनट / ट्रॉली",
      label_gate_status: "गेट की स्थिति",
      badge_open: "खुला",
      title_msp_calc: "आधिकारिक MSP और कैलकुलेटर",
      subtitle_msp_calc: "MSP भुगतान कैलकुलेटर",
      label_qty_quintals: "मात्रा (क्विंटल में)",
      label_estimated_value: "MSP पर अनुमानित मूल्य (₹2,300/क्विंटल)",
      title_booking: "फार्म पिकअप बुक करें",
      subtitle_booking: "सत्यापित स्थानीय परिवहन साझेदार",
      veh_name_tractor: "ट्रैक्टर ट्रॉली",
      veh_cap_60: "क्षमता: 60 क्विंटल",
      veh_eta_20: "समय: ~20 मिनट",
      veh_dist_64: "दूरी: 6.4 किमी",
      veh_fare_850: "अनुमानित किराया: ₹850",
      badge_available: "उपलब्ध",
      btn_book_vehicle: "वाहन बुक करें",
      veh_name_minitruck: "मिनी ट्रक (बोलेरो/एस)",
      veh_cap_100: "क्षमता: 100 क्विंटल",
      veh_eta_28: "समय: ~28 मिनट",
      veh_fare_1450: "अनुमानित किराया: ₹1,450",
      badge_high_demand: "अधिक मांग",
      veh_name_lcv: "LCV (हल्का वाहन)",
      veh_cap_40: "क्षमता: 40 क्विंटल",
      veh_eta_15: "समय: ~15 मिनट",
      veh_fare_650: "अनुमानित किराया: ₹650",
      title_tracking: "निर्धारित परिवहन",
      label_booking_id: "बुकिंग आईडी",
      label_vehicle: "वाहन",
      label_driver: "चालक",
      label_eta_farm: "खेत तक पहुँचने का समय",
      value_15min: "15 मिनट",
      label_distance: "दूरी",
      value_dist_72: "7.2 किमी",
      label_total_fare: "कुल किराया",
      map_caption: "📍 चालक सुखदेव सिंह दौदपुर फार्म की ओर आ रहे हैं",
      title_payment: "DBT भुगतान स्थिति",
      label_total_payable: "कुल देय राशि",
      badge_processing: "प्रक्रिया में",
      label_weighed_quantity: "तौली गई मात्रा",
      label_rate: "दर",
      label_bank_account: "बैंक खाता",
      label_reference: "संदर्भ संख्या",
      title_profile: "किसान प्रोफ़ाइल",
      profile_sub: "दौदपुर गांव, लुधियाना • धान उत्पादक",
      label_language: "भाषा",
      toggle_large_text: "बड़ा टेक्स्ट",
      toggle_high_contrast: "उच्च कंट्रास्ट",
      toggle_read_aloud: "जोर से पढ़ें",
      btn_read_screen: "🔊 इस स्क्रीन को पढ़ें",
      label_low_connectivity: "📶 कम कनेक्टिविटी मोड",
      sync_caption: "अंतिम सिंक: सुबह 9:42 · ऑफ़लाइन उपलब्ध",
      nav_home: "होम",
      nav_go_now: "अभी जाएं?",
      nav_queue: "कतार",
      nav_transport: "परिवहन",
      nav_payment: "भुगतान",
      lang_switch_announce: "भाषा हिंदी में बदल दी गई है",
      btn_book_slot: "स्लॉट बुक करें",
      slot_booked_status: "✅ गेट 2 के लिए स्लॉट बुक हो गया, सुबह 10:00 बजे",
      toast_slot_booked: "आपका स्लॉट गेट 2 के लिए सुबह 10:00 बजे बुक कर दिया गया है।",
      toast_slot_already: "आपका स्लॉट पहले से ही बुक है।",
      voice_cmd_aria: "आवाज़ से आदेश",
      voice_listening: "सुन रहा हूँ… कहें \"स्लॉट बुक करो\"",
      voice_not_supported: "इस ब्राउज़र में आवाज़ कमांड उपलब्ध नहीं है। कृपया Chrome आज़माएँ।",
      voice_not_recognized: "कोई कमांड समझ नहीं आया। \"स्लॉट बुक करो\" कहकर देखें।",
      no_voice_available: "इस डिवाइस पर {lang} आवाज़ उपलब्ध नहीं है — डिफ़ॉल्ट आवाज़ चलाई जा रही है।"
    },

    pa: {
      nav_logout: "ਲੌਗ ਆਊਟ",
      dash_greeting: "ਸ਼ੁਭ ਸਵੇਰ,",
      dash_sync: "🔄 Supabase ਨਾਲ ਲਾਈਵ ਸਿੰਕ",
      label_procurement_centre: "ਖਰੀਦ ਕੇਂਦਰ",
      label_assigned_gate: "ਨਿਰਧਾਰਿਤ ਗੇਟ",
      value_gate_2: "ਗੇਟ 2",
      label_token_id: "ਟੋਕਨ ਆਈਡੀ",
      label_crop: "ਫ਼ਸਲ",
      value_crop_paddy: "🌾 ਝੋਨਾ (ਆਮ)",
      value_crop_paddy_full: "ਝੋਨਾ (ਆਮ, PR-126)",
      label_quantity: "ਮਾਤਰਾ",
      value_quantity_20: "20 ਕੁਇੰਟਲ",
      label_schedule_slot: "ਸਮਾਂ ਸਲਾਟ",
      value_schedule: "ਅੱਜ, ਸਵੇਰੇ 10:00 – ਦੁਪਹਿਰ 12:00",
      label_recommended_arrival: "ਸੁਝਾਇਆ ਗਿਆ ਪਹੁੰਚਣ ਦਾ ਸਮਾਂ",
      label_crowd_level: "ਭੀੜ ਦਾ ਪੱਧਰ",
      badge_moderate: "ਦਰਮਿਆਨਾ",
      label_estimated_wait: "ਅਨੁਮਾਨਿਤ ਉਡੀਕ ਸਮਾਂ",
      value_wait_45mins: "45 ਮਿੰਟ",
      value_wait_45minutes: "45 ਮਿੰਟ",
      label_msp_paddy: "ਝੋਨੇ ਲਈ ਸਰਕਾਰੀ MSP",
      value_msp_price: "₹2,300 / ਕੁਇੰਟਲ",
      title_go_now: "ਕੀ ਹੁਣੇ ਜਾਣਾ ਚਾਹੀਦਾ ਹੈ?",
      demo_label_telemetry: "ਸਮਾਰਟ ਮੰਡੀ ਟੈਲੀਮੈਟਰੀ ਸਲਾਹ",
      go_now_main: "ਸਵੇਰੇ 09:15 ਵਜੇ ਨਿਕਲੋ",
      label_expected_arrival: "ਅਨੁਮਾਨਿਤ ਪਹੁੰਚ",
      label_weighbridge_slot: "ਵੇਅਬ੍ਰਿਜ ਸਲਾਟ",
      go_now_explain: "ਟੋਕਨ PB-KHN-099 ਤੋਂ ਪਹਿਲਾਂ 18 ਕਿਸਾਨ ਹਨ ਅਤੇ ਦੌਦਪੁਰ ਪਿੰਡ ਤੋਂ 25 ਮਿੰਟ ਦਾ ਸਫ਼ਰ ਹੈ, ਇਸ ਲਈ ਸਵੇਰੇ 09:15 ਵਜੇ ਨਿਕਲਣ ਨਾਲ ਤੁਸੀਂ ਬਿਨਾਂ ਉਡੀਕ ਕੀਤੇ ਸਮੇਂ ਸਿਰ ਗੇਟ 2 ਪਹੁੰਚ ਜਾਓਗੇ।",
      title_token_pass: "ਖਰੀਦ ਟੋਕਨ ਪਾਸ",
      label_centre: "ਕੇਂਦਰ",
      label_slot: "ਸਲਾਟ",
      label_gate: "ਗੇਟ",
      label_token: "ਟੋਕਨ",
      qr_caption: "ਗੇਟ 2 ਵੇਅਬ੍ਰਿਜ 'ਤੇ ਸਕੈਨ ਕਰੋ",
      title_queue: "ਗੇਟ 2 ਦੀ ਲਾਈਵ ਕਤਾਰ",
      label_currently_serving: "ਹੁਣ ਸੇਵਾ ਵਿੱਚ",
      label_your_token: "ਤੁਹਾਡਾ ਟੋਕਨ",
      queue_caption: "ਤੁਹਾਡੇ ਤੋਂ ਪਹਿਲਾਂ 18 ਕਿਸਾਨ ਹਨ",
      label_processing_rate: "ਪ੍ਰੋਸੈਸਿੰਗ ਦਰ",
      value_processing_rate: "2.5 ਮਿੰਟ / ਟਰਾਲੀ",
      label_gate_status: "ਗੇਟ ਦੀ ਸਥਿਤੀ",
      badge_open: "ਖੁੱਲ੍ਹਾ",
      title_msp_calc: "ਸਰਕਾਰੀ MSP ਅਤੇ ਕੈਲਕੁਲੇਟਰ",
      subtitle_msp_calc: "MSP ਭੁਗਤਾਨ ਕੈਲਕੁਲੇਟਰ",
      label_qty_quintals: "ਮਾਤਰਾ (ਕੁਇੰਟਲ ਵਿੱਚ)",
      label_estimated_value: "MSP 'ਤੇ ਅਨੁਮਾਨਿਤ ਮੁੱਲ (₹2,300/ਕੁਇੰਟਲ)",
      title_booking: "ਫਾਰਮ ਪਿਕਅੱਪ ਬੁੱਕ ਕਰੋ",
      subtitle_booking: "ਪ੍ਰਮਾਣਿਤ ਸਥਾਨਕ ਲੌਜਿਸਟਿਕਸ ਭਾਈਵਾਲ",
      veh_name_tractor: "ਟਰੈਕਟਰ ਟਰਾਲੀ",
      veh_cap_60: "ਸਮਰੱਥਾ: 60 ਕੁਇੰਟਲ",
      veh_eta_20: "ਸਮਾਂ: ~20 ਮਿੰਟ",
      veh_dist_64: "ਦੂਰੀ: 6.4 ਕਿਲੋਮੀਟਰ",
      veh_fare_850: "ਅਨੁਮਾਨਿਤ ਕਿਰਾਇਆ: ₹850",
      badge_available: "ਉਪਲਬਧ",
      btn_book_vehicle: "ਵਾਹਨ ਬੁੱਕ ਕਰੋ",
      veh_name_minitruck: "ਮਿੰਨੀ ਟਰੱਕ (ਬੋਲੇਰੋ/ਏਸ)",
      veh_cap_100: "ਸਮਰੱਥਾ: 100 ਕੁਇੰਟਲ",
      veh_eta_28: "ਸਮਾਂ: ~28 ਮਿੰਟ",
      veh_fare_1450: "ਅਨੁਮਾਨਿਤ ਕਿਰਾਇਆ: ₹1,450",
      badge_high_demand: "ਵਧੇਰੇ ਮੰਗ",
      veh_name_lcv: "LCV (ਹਲਕਾ ਵਾਹਨ)",
      veh_cap_40: "ਸਮਰੱਥਾ: 40 ਕੁਇੰਟਲ",
      veh_eta_15: "ਸਮਾਂ: ~15 ਮਿੰਟ",
      veh_fare_650: "ਅਨੁਮਾਨਿਤ ਕਿਰਾਇਆ: ₹650",
      title_tracking: "ਨਿਰਧਾਰਿਤ ਆਵਾਜਾਈ",
      label_booking_id: "ਬੁਕਿੰਗ ਆਈਡੀ",
      label_vehicle: "ਵਾਹਨ",
      label_driver: "ਡਰਾਈਵਰ",
      label_eta_farm: "ਖੇਤ ਤੱਕ ਪਹੁੰਚਣ ਦਾ ਸਮਾਂ",
      value_15min: "15 ਮਿੰਟ",
      label_distance: "ਦੂਰੀ",
      value_dist_72: "7.2 ਕਿਲੋਮੀਟਰ",
      label_total_fare: "ਕੁੱਲ ਕਿਰਾਇਆ",
      map_caption: "📍 ਡਰਾਈਵਰ ਸੁਖਦੇਵ ਸਿੰਘ ਦੌਦਪੁਰ ਫਾਰਮ ਵੱਲ ਆ ਰਹੇ ਹਨ",
      title_payment: "DBT ਭੁਗਤਾਨ ਸਥਿਤੀ",
      label_total_payable: "ਕੁੱਲ ਦੇਣਯੋਗ ਰਾਸ਼ੀ",
      badge_processing: "ਪ੍ਰਕਿਰਿਆ ਵਿੱਚ",
      label_weighed_quantity: "ਤੋਲੀ ਗਈ ਮਾਤਰਾ",
      label_rate: "ਦਰ",
      label_bank_account: "ਬੈਂਕ ਖਾਤਾ",
      label_reference: "ਹਵਾਲਾ ਨੰਬਰ",
      title_profile: "ਕਿਸਾਨ ਪ੍ਰੋਫ਼ਾਈਲ",
      profile_sub: "ਦੌਦਪੁਰ ਪਿੰਡ, ਲੁਧਿਆਣਾ • ਝੋਨਾ ਉਤਪਾਦਕ",
      label_language: "ਭਾਸ਼ਾ",
      toggle_large_text: "ਵੱਡਾ ਟੈਕਸਟ",
      toggle_high_contrast: "ਉੱਚ ਕੰਟ੍ਰਾਸਟ",
      toggle_read_aloud: "ਉੱਚੀ ਆਵਾਜ਼ ਵਿੱਚ ਪੜ੍ਹੋ",
      btn_read_screen: "🔊 ਇਹ ਸਕ੍ਰੀਨ ਪੜ੍ਹੋ",
      label_low_connectivity: "📶 ਘੱਟ ਕਨੈਕਟੀਵਿਟੀ ਮੋਡ",
      sync_caption: "ਆਖਰੀ ਸਿੰਕ: ਸਵੇਰੇ 9:42 · ਆਫਲਾਈਨ ਉਪਲਬਧ",
      nav_home: "ਹੋਮ",
      nav_go_now: "ਹੁਣੇ ਜਾਓ?",
      nav_queue: "ਕਤਾਰ",
      nav_transport: "ਆਵਾਜਾਈ",
      nav_payment: "ਭੁਗਤਾਨ",
      lang_switch_announce: "ਭਾਸ਼ਾ ਪੰਜਾਬੀ ਵਿੱਚ ਬਦਲ ਦਿੱਤੀ ਗਈ ਹੈ",
      btn_book_slot: "ਸਲਾਟ ਬੁੱਕ ਕਰੋ",
      slot_booked_status: "✅ ਗੇਟ 2 ਲਈ ਸਲਾਟ ਬੁੱਕ ਹੋ ਗਿਆ, ਸਵੇਰੇ 10:00 ਵਜੇ",
      toast_slot_booked: "ਤੁਹਾਡਾ ਸਲਾਟ ਗੇਟ 2 ਲਈ ਸਵੇਰੇ 10:00 ਵਜੇ ਬੁੱਕ ਕਰ ਦਿੱਤਾ ਗਿਆ ਹੈ।",
      toast_slot_already: "ਤੁਹਾਡਾ ਸਲਾਟ ਪਹਿਲਾਂ ਹੀ ਬੁੱਕ ਹੈ।",
      voice_cmd_aria: "ਆਵਾਜ਼ ਕਮਾਂਡ",
      voice_listening: "ਸੁਣ ਰਿਹਾ ਹਾਂ… ਕਹੋ \"ਸਲਾਟ ਬੁੱਕ ਕਰੋ\"",
      voice_not_supported: "ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਆਵਾਜ਼ ਕਮਾਂਡ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ Chrome ਵਰਤੋ।",
      voice_not_recognized: "ਕੋਈ ਕਮਾਂਡ ਸਮਝ ਨਹੀਂ ਆਈ। \"ਸਲਾਟ ਬੁੱਕ ਕਰੋ\" ਕਹਿ ਕੇ ਵੇਖੋ।",
      no_voice_available: "ਇਸ ਡਿਵਾਈਸ 'ਤੇ {lang} ਆਵਾਜ਼ ਉਪਲਬਧ ਨਹੀਂ — ਡਿਫੌਲਟ ਆਵਾਜ਼ ਚਲਾਈ ਜਾ ਰਹੀ ਹੈ।"
    }
  };

  // BCP-47 codes used for both <html lang> and SpeechSynthesis voice matching
  const speechLocale = { en: "en-IN", hi: "hi-IN", pa: "pa-IN" };
  const STORAGE_KEY = "fasalraah_lang";

  // ---- 2. APPLY TRANSLATIONS ------------------------------------------
  function applyLanguage(lang) {
    if (!translations[lang]) lang = "en";
    const dict = translations[lang];

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key] !== undefined) {
        el.textContent = dict[key];
      }
    });

    // Re-inject the read-aloud speaker icons on section headings that also
    // carry a nested <button class="speak-btn">, since textContent above
    // would have wiped them out.
    document.querySelectorAll(".section-title .speak-btn").forEach((btn) => {
      btn.textContent = "🔊";
    });
    document.querySelectorAll("[data-i18n='title_go_now']").forEach((el) => {
      if (!el.querySelector(".speak-btn")) {
        el.insertAdjacentHTML(
          "beforeend",
          ' <button type="button" class="speak-btn" data-speak-target="go-now" aria-label="Read this section aloud">🔊</button>'
        );
      }
    });
    document.querySelectorAll("[data-i18n='title_queue']").forEach((el) => {
      if (!el.querySelector(".speak-btn")) {
        el.insertAdjacentHTML(
          "beforeend",
          ' <button type="button" class="speak-btn" data-speak-target="queue" aria-label="Read this section aloud">🔊</button>'
        );
      }
    });
    bindSpeakButtons();

    document.documentElement.lang = speechLocale[lang].split("-")[0];
    document.body.setAttribute("data-lang", lang);
    localStorage.setItem(STORAGE_KEY, lang);
    currentLang = lang;

    const select = document.getElementById("language-select");
    if (select) select.value = lang;

    // Cancel anything mid-sentence in the old language, then greet in the new one.
    // Chrome silently drops speak() calls made in the same tick as cancel(),
    // so we push the actual speak() to the next tick.
    window.speechSynthesis.cancel();
    setTimeout(() => speak(dict.lang_switch_announce, lang), 100);
  }

  // ---- 3. TEXT-TO-SPEECH -----------------------------------------------
  let voicesCache = [];
  function loadVoices() {
    voicesCache = window.speechSynthesis.getVoices();
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function pickVoice(lang) {
    if (!voicesCache.length) loadVoices();
    const target = speechLocale[lang]; // e.g. hi-IN
    const shortCode = target.split("-")[0]; // e.g. hi
    return (
      voicesCache.find((v) => v.lang === target) ||
      voicesCache.find((v) => v.lang && v.lang.toLowerCase().startsWith(shortCode)) ||
      null
    );
  }

  let voiceWarningShown = { hi: false, pa: false };

  function speak(text, lang, onEnd) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();

    const trySpeak = () => {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(lang);

      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      } else {
        // No dedicated voice on this device for hi/pa — still set lang so the
        // OS/browser engine attempts its best pronunciation, and tell the
        // farmer once per language why it may sound like a different accent.
        utter.lang = speechLocale[lang];
        if (lang !== "en" && !voiceWarningShown[lang]) {
          voiceWarningShown[lang] = true;
          showToast(
            translations[lang].no_voice_available.replace(
              "{lang}",
              lang === "hi" ? "हिंदी / Hindi" : "ਪੰਜਾਬੀ / Punjabi"
            )
          );
        }
      }
      utter.rate = 0.95;
      if (onEnd) utter.onend = onEnd;
      window.speechSynthesis.speak(utter);
    };

    // Voices sometimes aren't loaded yet on first page load
    if (voicesCache.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
        trySpeak();
      };
      // fallback in case onvoiceschanged never fires (some browsers)
      setTimeout(trySpeak, 300);
    } else {
      trySpeak();
    }
  }

  function showToast(msg) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    container.appendChild(toast);
    // Trigger the .is-visible transition on the next frame
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // Reads every visible piece of text inside a section, in the current language
  function speakSection(sectionEl) {
    if (!sectionEl) return;
    const parts = [];
    sectionEl.querySelectorAll("h2, h3, p, span, strong, label, button").forEach((el) => {
      // Skip the speaker icon itself and empty/icon-only nodes
      if (el.classList.contains("speak-btn")) return;
      if (el.children.length > 0 && el.tagName !== "STRONG") return;
      const txt = el.textContent.trim();
      if (txt) parts.push(txt);
    });
    const fullText = [...new Set(parts)].join(". ");
    speak(fullText, currentLang);
  }

  function findVisibleSection() {
    const sections = document.querySelectorAll("section.screen");
    let best = null;
    let bestVisible = 0;
    sections.forEach((sec) => {
      const rect = sec.getBoundingClientRect();
      const visible =
        Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      if (visible > bestVisible) {
        bestVisible = visible;
        best = sec;
      }
    });
    return best || document.getElementById("dashboard");
  }

  function bindSpeakButtons() {
    document.querySelectorAll(".speak-btn").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "true";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.getAttribute("data-speak-target");
        const section = targetId
          ? document.getElementById(targetId)
          : btn.closest("section.screen");
        speakSection(section);
      });
    });
  }

  // ---- 4. ACCESSIBILITY TOGGLES ------------------------------------------
  const A11Y_KEY = "fasalraah_a11y";

  function getA11yState() {
    try {
      return JSON.parse(localStorage.getItem(A11Y_KEY)) || { largeText: false, highContrast: false };
    } catch (e) {
      return { largeText: false, highContrast: false };
    }
  }

  function applyA11yState(state) {
    document.body.classList.toggle("large-text", !!state.largeText);
    document.body.classList.toggle("high-contrast", !!state.highContrast);

    const largeToggle = document.getElementById("toggle-large-text");
    const contrastToggle = document.getElementById("toggle-high-contrast");
    if (largeToggle) {
      largeToggle.classList.toggle("is-on", !!state.largeText);
      largeToggle.setAttribute("aria-checked", String(!!state.largeText));
    }
    if (contrastToggle) {
      contrastToggle.classList.toggle("is-on", !!state.highContrast);
      contrastToggle.setAttribute("aria-checked", String(!!state.highContrast));
    }
    localStorage.setItem(A11Y_KEY, JSON.stringify(state));
  }

  function bindToggle(id, stateKey) {
    const el = document.getElementById(id);
    if (!el) return;
    const toggle = () => {
      const state = getA11yState();
      state[stateKey] = !state[stateKey];
      applyA11yState(state);
    };
    el.addEventListener("click", toggle);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  }

  // ---- 5. BOOK SLOT --------------------------------------------------------
  const BOOK_KEY = "fasalraah_slot_booked";

  function isSlotBooked() {
    return localStorage.getItem(BOOK_KEY) === "true";
  }

  function bookSlot() {
    const dict = translations[currentLang];
    const statusEl = document.getElementById("slot-status");
    const btn = document.getElementById("book-slot-btn");

    if (isSlotBooked()) {
      showToast(dict.toast_slot_already);
      speak(dict.toast_slot_already, currentLang);
      return;
    }

    localStorage.setItem(BOOK_KEY, "true");
    if (statusEl) statusEl.style.display = "block";
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.6";
    }
    showToast(dict.toast_slot_booked);
    speak(dict.toast_slot_booked, currentLang);
  }

  function refreshSlotUI() {
    const statusEl = document.getElementById("slot-status");
    const btn = document.getElementById("book-slot-btn");
    if (isSlotBooked()) {
      if (statusEl) statusEl.style.display = "block";
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.6";
      }
    }
  }

  // ---- 6. VOICE COMMANDS ("book the slot") --------------------------------
  // Phrases (lowercased) that count as a "book the slot" command, per language.
  const bookCommandPhrases = {
    en: ["book the slot", "book slot", "book my slot"],
    hi: ["स्लॉट बुक करो", "स्लॉट बुक करें", "बुक करो", "स्लॉट बुक कर दो"],
    pa: ["ਸਲਾਟ ਬੁੱਕ ਕਰੋ", "ਸਲਾਟ ਬੁੱਕ ਕਰ ਦਿਓ", "ਬੁੱਕ ਕਰੋ"]
  };

  let recognition = null;
  let recognizing = false;

  function getRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function matchesBookCommand(transcript, lang) {
    const t = transcript.trim().toLowerCase();
    return bookCommandPhrases[lang].some((phrase) => t.includes(phrase.toLowerCase()));
  }

  function setVoiceCmdUI(state, message) {
    const btn = document.getElementById("voice-cmd-btn");
    const status = document.getElementById("voice-cmd-status");
    if (btn) btn.classList.toggle("listening", state === "listening");
    if (status) {
      if (message) {
        status.textContent = message;
        status.hidden = false;
      } else {
        status.hidden = true;
      }
    }
  }

  function startVoiceCommand() {
    const Ctor = getRecognitionCtor();
    const dict = translations[currentLang];

    if (!Ctor) {
      showToast(dict.voice_not_supported);
      speak(dict.voice_not_supported, currentLang);
      return;
    }

    if (recognizing) {
      recognition.stop();
      return;
    }

    recognition = new Ctor();
    recognition.lang = speechLocale[currentLang];
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognizing = true;
    setVoiceCmdUI("listening", dict.voice_listening);

    recognition.onresult = (event) => {
      const results = event.results[0];
      let matched = false;
      for (let i = 0; i < results.length; i++) {
        const transcript = results[i].transcript;
        if (matchesBookCommand(transcript, currentLang)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        bookSlot();
      } else {
        showToast(dict.voice_not_recognized);
        speak(dict.voice_not_recognized, currentLang);
      }
    };

    recognition.onerror = () => {
      recognizing = false;
      setVoiceCmdUI("idle", null);
    };

    recognition.onend = () => {
      recognizing = false;
      setVoiceCmdUI("idle", null);
    };

    recognition.start();
  }

  // ---- 7. WIRE UP UI -----------------------------------------------------
  let currentLang = "en";

  document.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("language-select");
    const savedLang = localStorage.getItem(STORAGE_KEY) || "en";

    applyLanguage(savedLang);
    applyA11yState(getA11yState());
    refreshSlotUI();

    if (select) {
      select.addEventListener("change", (e) => {
        applyLanguage(e.target.value);
      });
    }

    const readAloudBtn = document.getElementById("read-aloud-btn");
    if (readAloudBtn) {
      readAloudBtn.addEventListener("click", () => {
        speakSection(findVisibleSection());
      });
    }

    bindToggle("toggle-large-text", "largeText");
    bindToggle("toggle-high-contrast", "highContrast");

    const bookBtn = document.getElementById("book-slot-btn");
    if (bookBtn) bookBtn.addEventListener("click", bookSlot);

    const voiceBtn = document.getElementById("voice-cmd-btn");
    if (voiceBtn) voiceBtn.addEventListener("click", startVoiceCommand);
  });
})();
