# Aesthesiasim — Clinical Anesthesia Simulation Website

A high-fidelity virtual anesthesia simulation web application featuring real-time patient monitoring, anesthesia machine and ventilator controls, diagnostic orders (STAT laboratory panels and portable imaging), pharmacologic interventions, dynamic physiological deterioration and improvement, and multiple scenario phases within a single clinical case. Supports **Supabase** for database synchronization with an automatic local offline fallback.

---

## 🚀 Key Features

### 1. Patient Selection Roster (Names & Ages)

- Browse patients with **Name**, **Age**, Gender, Weight, Height, BMI, and ASA Physical Status Classification (e.g. ASA III E Emergent).
- Full preoperative clinical files: surgical procedure, clinical history, drug allergies, Mallampati airway classification, thyromental distance, and neck mobility.
- Choose from the roster and start the case directly.

### 2. Premier Multi-Scenario Case: Elena Rostova (58yo Female)

**Procedure:** Emergent Exploratory Laparotomy for Perforated Sigmoid Diverticulitis & Septic Peritonitis.
Four distinct, interactive scenario phases in one case:

1. **Phase 1: Pre-Op & Rapid Sequence Induction (RSI)**: Manage high aspiration risk in a non-NPO septic patient. Apply 100% preoxygenation, choose appropriate induction and rapid paralytics (Rocuronium 1.2 mg/kg / Succinylcholine), intubate via video laryngoscopy, and confirm placement with bilateral breath sounds and EtCO2.
2. **Phase 2: Acute Airway Crisis — Severe Bronchospasm**: Peak Inspiratory Pressure (PIP) surges to 48 cmH2O, tidal volumes drop, and capnography shows an obstructive "shark-fin" pattern. Auscultate bilateral wheezing, deepen anesthesia, deliver in-line Albuterol / IV Magnesium, and adjust ventilator I:E ratio (1:3 or 1:4).
3. **Phase 3: Hemodynamic Collapse — Mesenteric Bleed & Septic Vasoplegia**: Sudden 1200 mL blood loss drops BP to 62/34 (MAP 43 mmHg) and HR spikes to 136 bpm. Turn down volatile gas, order STAT PRBC and ABG/coags, administer rapid crystalloids and blood transfusion, start Norepinephrine, and give Tranexamic Acid (TXA).
4. **Phase 4: Emergence, Neuromuscular Reversal & PACU Transfer**: Discontinue volatile agents, treat hypothermia with convective warming (Bair Hugger), reverse neuromuscular block with Sugammadex based on TOF twitches, and verify extubation criteria.

---

### 3. Realistic Multiparameter Patient Monitoring Screen

- **Real-Time Oscilloscope Waveforms (Canvas)**:
  - **ECG Lead II** with realistic P-QRS-T complexes.
  - **Pulse Oximetry Plethysmograph** with dicrotic notch.
  - **Arterial Line (ART)** pulsatile waveform with beat-to-beat pressure.
  - **Capnography (EtCO2)** with normal square waves or dynamic **shark-fin obstructive slope** during bronchospasm!
- **Audio Synthesizer (Web Audio API)**:
  - Pulse oximeter tone with pitch modulated by $SpO_2$ percentage.
  - Heart rate QRS beeps and critical 3-tone alarms.
  - Alarm silence and mute controls.
- **Digital Vitals**: HR, SpO2, Systolic/Diastolic/MAP, EtCO2, RR, Core Temperature (°C and °F), Train-of-Four (TOF 0-4) twitches, and BIS depth.

---

### 4. Anesthesia Workstation & Ventilator Screen

- **Ventilator Modes**: VCV, PCV, PSV, Manual / Spontaneous.
- **Live Mechanics & Gauges**: Peak Inspiratory Pressure (PIP), Plateau Pressure (Pplat), PEEP, Compliance ($C_{dyn}$), Expired Tidal Volume ($V_T$), and Minute Ventilation ($V_E$).
- **Controls**: Set $V_T$, Set RR, PEEP, $FiO_2$ (21-100%), and I:E Ratio (1:1, 1:2, 1:3, 1:4).
- **Vaporizer Dial**: Sevoflurane (0 to 5%) with inspired/expired agent monitoring and age-adjusted MAC calculation.

---

### 5. Diagnostic Orders (STAT Labs & Imaging)

- **STAT Laboratory Panels**:
  - Arterial Blood Gas (ABG) with Co-Oximetry (pH, PaCO2, PaO2, HCO3, Base Excess, SaO2).
  - Complete Blood Count (CBC) with Platelets.
  - Basic Metabolic Panel (Chem-7 / BMP).
  - Coagulation Profile (PT/INR, aPTT, Fibrinogen).
  - Serum Lactate & High-Sensitivity Cardiac Troponin I.
  - Type & Screen / Crossmatch PRBC release.
  - Results dynamically reflect patient physiological changes in real time!
- **Portable Imaging & Ultrasound**:
  - Portable Chest X-Ray (CXR) with interactive radiograph diagram and radiology report.
  - Point-of-Care Ultrasound (POCUS) evaluating IVC collapsibility, hyperdynamic LV, and pleural lung sliding.
  - 12-Lead Diagnostic Electrocardiogram.

---

### 6. Pharmacy & Medication Administration

- Filter by category: Induction & Hypnotics, Opioids, Neuromuscular Blockers, Reversal Agents, Vasopressors & Inotropes, Emergency & Respiratory, Fluids & Blood Products.
- Pick standard doses or type custom doses.
- Routes: IV Push, IV Piggyback / Drip, Inhalation, IM.
- Live onset and physiological curves directly influencing vitals!

---

### 7. Supabase Database Integration

- **SQL Schema**: Provided in `supabase/schema.sql` (Tables: `patients`, `scenarios`, `case_sessions`, `action_logs`, `diagnostic_orders`).
- **Cloud Sync**: Sessions, scores, and timestamped medication actions automatically sync to your Supabase project.
- **In-App Config**: Enter your Supabase Project URL and Anon Key directly via the top-bar button, with built-in connection testing and schema copy.
- **Local Fallback**: Automatically operates seamlessly offline without requiring Supabase credentials.

---

## 🛠️ Development & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Local server URL: **`http://localhost:5173/`**
