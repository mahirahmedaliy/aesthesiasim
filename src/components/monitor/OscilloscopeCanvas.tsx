import React, { useEffect, useRef } from 'react';
import { DynamicPhysiology, VentilatorState, MonitoringAttachments } from '../../types/simulator';
import { audioEngine } from '../../utils/audioEngine';

interface OscilloscopeCanvasProps {
  phys: DynamicPhysiology;
  vent: VentilatorState;
  monitoring?: MonitoringAttachments;
  isPaused: boolean;
  timeScale: number;
}

export const OscilloscopeCanvas: React.FC<OscilloscopeCanvasProps> = ({
  phys,
  vent,
  monitoring,
  isPaused,
  timeScale,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Oscilloscope sweep and continuous physiological phase clocks
  const cursorXRef = useRef<number>(0);
  const cardiacTimeRef = useRef<number>(0);
  const breathTimeRef = useRef<number>(0);
  const beatIndexRef = useRef<number>(0);
  const lastHeartBeatTimeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  // Store latest props in refs for real-time requestAnimationFrame access
  const physRef = useRef<DynamicPhysiology>(phys);
  physRef.current = phys;
  const ventRef = useRef<VentilatorState>(vent);
  ventRef.current = vent;
  const monitoringRef = useRef<MonitoringAttachments | undefined>(monitoring);
  monitoringRef.current = monitoring;
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const timeScaleRef = useRef<number>(timeScale);
  timeScaleRef.current = timeScale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI crisp rendering
    const dpr = window.devicePixelRatio || 1;
    let rect = canvas.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Initial background fill
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, width, height);

    const handleResize = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        width = r.width;
        height = r.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, width, height);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(canvas);

    // =========================================================================
    // PHYSIOLOGICAL WAVEFORM GENERATORS
    // =========================================================================

    // 1. ECG (Lead II) in Millivolts (mV)
    const getEcgMv = (
      t: number,
      beatPeriod: number,
      rhythm: string,
      stElevMm: number,
      potassiumMeq: number,
      isPvc: boolean
    ): number => {
      const isAsystole = rhythm === 'Asystole' || physRef.current.hr === 0;
      const isVF = rhythm === 'Ventricular Fibrillation (VF)';
      const isVT = rhythm === 'Ventricular Tachycardia (VT)';

      if (isAsystole) {
        // True isoelectric flatline with subtle amplifier thermal noise
        return Math.sin(t * 1.5) * 0.015 + Math.sin(t * 7.2) * 0.008;
      }

      if (isVF) {
        // Chaotic asynchronous fibrillatory oscillations (coarse VF)
        return (
          Math.sin(t * 26.5) * 0.42 +
          Math.sin(t * 39.2 + 1.2) * 0.32 +
          Math.cos(t * 54.1 + 2.4) * 0.18 +
          Math.sin(t * 12.3) * 0.15
        );
      }

      if (isVT) {
        // Rapid, monomorphic, broad tombstone complexes
        const vtPhase = (t % beatPeriod) / beatPeriod;
        return (
          Math.sin(vtPhase * Math.PI * 2) * 0.95 -
          Math.cos(vtPhase * Math.PI * 4) * 0.35 -
          0.15
        );
      }

      // Time into current cardiac cycle
      const tInBeat = t % beatPeriod;
      const tR = Math.min(0.22, beatPeriod * 0.28); // R-peak position

      if (isPvc) {
        // Wide, bizarre premature ventricular contraction with discordant T wave
        const qrsWidth = 0.032; // ~130ms wide
        const pvcQrs = -1.35 * Math.exp(-Math.pow(tInBeat - tR, 2) / (2 * Math.pow(qrsWidth, 2)));
        const notch = 0.35 * Math.exp(-Math.pow(tInBeat - (tR + 0.035), 2) / (2 * Math.pow(0.018, 2)));
        const discordantT = 0.65 * Math.exp(-Math.pow(tInBeat - (tR + 0.16), 2) / (2 * Math.pow(0.065, 2)));
        return pvcQrs + notch + discordantT;
      }

      // Normal Sinus, Sinus Bradycardia, Sinus Tachycardia, AF, SVT
      let val = 0;

      // Atrial Fibrillation: No P-waves, continuous fibrillatory baseline
      const isAF = rhythm === 'Atrial Fibrillation';
      if (isAF) {
        val +=
          Math.sin(t * 42.0) * 0.035 +
          Math.sin(t * 56.4 + 1.1) * 0.025 +
          Math.cos(t * 73.1 + 0.4) * 0.018;
      } else if (rhythm !== 'Supraventricular Tachycardia (SVT)') {
        // Normal P-wave (atrial depolarization)
        const tP = tR - 0.13;
        if (tP > 0) {
          const pSigma = 0.020;
          val += 0.16 * Math.exp(-Math.pow(tInBeat - tP, 2) / (2 * Math.pow(pSigma, 2)));
        }
      }

      // Q-wave (septal depolarization)
      const tQ = tR - 0.024;
      if (tQ > 0) {
        val -= 0.16 * Math.exp(-Math.pow(tInBeat - tQ, 2) / (2 * Math.pow(0.007, 2)));
      }

      // R-wave (rapid ventricular depolarization) - Needle sharp Gaussian
      const rSigma = potassiumMeq > 6.5 ? 0.016 : 0.010; // QRS widens in severe hyperkalemia
      val += 1.38 * Math.exp(-Math.pow(tInBeat - tR, 2) / (2 * Math.pow(rSigma, 2)));

      // S-wave (terminal ventricular depolarization)
      const tS = tR + 0.028;
      val -= 0.38 * Math.exp(-Math.pow(tInBeat - tS, 2) / (2 * Math.pow(0.011, 2)));

      // ST Segment (elevation or depression)
      const tStStart = tS + 0.02;
      const tStEnd = tR + 0.15;
      if (tInBeat >= tStStart && tInBeat <= tStEnd) {
        const stFrac = (tInBeat - tStStart) / (tStEnd - tStStart);
        const stEnvelope = Math.sin(stFrac * Math.PI);
        val += (stElevMm * 0.10) * stEnvelope;
      }

      // T-wave (ventricular repolarization)
      const tT = tR + 0.20 + 0.08 * Math.sqrt(Math.max(0.4, beatPeriod));
      const isHyperkalemic = potassiumMeq > 5.2;
      const tAmp = isHyperkalemic
        ? 0.32 + Math.min(0.9, (potassiumMeq - 5.0) * 0.45) // Peaked tent-like T wave
        : 0.32 + (stElevMm * 0.04);
      const tSigma = isHyperkalemic
        ? Math.max(0.022, 0.048 - (potassiumMeq - 5.0) * 0.012) // Narrower peak
        : 0.048;

      // Slight physiological T-wave asymmetry (slower upstroke, steeper downslope)
      const dtT = tInBeat - tT;
      const asymSigma = dtT < 0 ? tSigma * 1.15 : tSigma * 0.90;
      val += tAmp * Math.exp(-Math.pow(dtT, 2) / (2 * Math.pow(asymSigma, 2)));

      return val;
    };

    // 2. Plethysmogram (Normalized 0.0 to 1.0)
    const getPlethNorm = (
      t: number,
      beatPeriod: number,
      spo2: number,
      bloodVol: number,
      mapVal: number,
      dbpVal: number,
      breathPhase: number,
      rhythm: string
    ): number => {
      const isArrest =
        rhythm === 'Asystole' ||
        rhythm === 'Ventricular Fibrillation (VF)' ||
        rhythm === 'Pulseless Electrical Activity (PEA)' ||
        physRef.current.hr === 0;

      if (isArrest || spo2 === 0) return 0;

      // Pulse transit time lag from LV ejection to finger (~160ms)
      const pulseLag = 0.16;
      const tPulse = (t - pulseLag + beatPeriod * 100) % beatPeriod;
      const tau = tPulse / beatPeriod;

      let curve = 0;
      if (tau < 0.16) {
        // Anacrotic upslope (perfusion arrival)
        curve = Math.pow(Math.sin((Math.PI * tau) / (2 * 0.16)), 2);
      } else if (tau < 0.28) {
        // Systolic runoff down to dicrotic notch
        const u = (tau - 0.16) / 0.12;
        curve = 1.0 - 0.38 * Math.pow(Math.sin((Math.PI * u) / 2), 2);
      } else if (tau < 0.42) {
        // Dicrotic notch and diastolic rebound wave
        const u = (tau - 0.28) / 0.14;
        curve = 0.62 + 0.11 * Math.sin(u * Math.PI);
      } else {
        // Catacrotic runoff (exponential decay to baseline)
        const u = (tau - 0.42) / 0.58;
        curve = 0.62 * Math.exp(-u * 2.8);
      }

      // Perfusion Index scaling (volume, pulse pressure, and SpO2)
      const pulsePres = Math.max(10, mapVal - dbpVal);
      const perfAmp = Math.min(
        1.0,
        Math.max(0.12, (pulsePres / 40) * (bloodVol / 5000) * (spo2 / 100))
      );

      // Respiratory variation (PVI / Delta POP swing during positive pressure ventilation)
      const hypovolemiaSwing = Math.max(0, (4800 - bloodVol) / 4800) * 0.30;
      const respModulation = 1.0 - (0.08 + hypovolemiaSwing) * Math.sin(breathPhase);

      return Math.max(0, curve * perfAmp * respModulation);
    };

    // 3. Arterial Line in mmHg
    const getArtPressureMmHg = (
      t: number,
      beatPeriod: number,
      sbpVal: number,
      dbpVal: number,
      bloodVol: number,
      breathPhase: number,
      rhythm: string
    ): number => {
      const isArrest =
        rhythm === 'Asystole' ||
        rhythm === 'Ventricular Fibrillation (VF)' ||
        rhythm === 'Pulseless Electrical Activity (PEA)' ||
        physRef.current.hr === 0;

      if (isArrest) {
        // Non-pulsatile mean systemic filling pressure in circulatory arrest
        return Math.max(10, Math.min(22, 14 + (bloodVol / 5000) * 6));
      }

      // Pulse transit time to radial artery (~110ms)
      const artLag = 0.11;
      const tArt = (t - artLag + beatPeriod * 100) % beatPeriod;
      const tau = tArt / beatPeriod;

      // Systolic Pressure Variation (SPV / PPV swing in hypovolemia)
      const pulsePressure = Math.max(10, sbpVal - dbpVal);
      const hypovolemiaPPV = Math.max(0, (4800 - bloodVol) / 4800) * 0.28;
      const breathSwing = pulsePressure * (0.05 + hypovolemiaPPV) * Math.sin(breathPhase);
      const effSbp = sbpVal + breathSwing;
      const effDeltaP = Math.max(8, effSbp - dbpVal);

      let p = dbpVal;
      if (tau < 0.11) {
        // Steep anacrotic upstroke (high dP/dt ejection into aorta)
        const u = tau / 0.11;
        p = dbpVal + effDeltaP * (1.02 * Math.pow(Math.sin((Math.PI * u) / 2), 2));
      } else if (tau < 0.25) {
        // Early systolic decline to dicrotic notch
        const u = (tau - 0.11) / 0.14;
        p = dbpVal + effDeltaP * (1.02 - 0.54 * Math.pow(Math.sin((Math.PI * u) / 2), 2));
      } else if (tau < 0.38) {
        // Dicrotic notch (closure of aortic valve) and secondary diastolic wave
        const u = (tau - 0.25) / 0.13;
        p = dbpVal + effDeltaP * (0.48 + 0.10 * Math.sin(u * Math.PI));
      } else {
        // Exponential diastolic runoff down to end-diastolic pressure
        const u = (tau - 0.38) / 0.62;
        p = dbpVal + effDeltaP * 0.48 * Math.exp(-u * 2.6);
      }

      return Math.max(0, p);
    };

    // 4. Capnography in mmHg (0 to 60 scale)
    const getEtCo2MmHg = (
      tBreath: number,
      breathPeriod: number,
      etco2Val: number,
      airwayPat: string,
      breathSounds: string,
      tofCount: number,
      muscleTone: number,
      bagVent: string,
      ventOn: boolean,
      effectiveRR: number
    ): number => {
      const isEsophageal = airwayPat === 'esophageal_intubated';
      const isApnea = effectiveRR <= 1 || (bagVent === 'vent' && !ventOn);

      if (isEsophageal || isApnea || etco2Val <= 0) {
        return 0; // Flatline at zero
      }

      const tau = (tBreath % breathPeriod) / breathPeriod;
      const isSharkFin = airwayPat === 'bronchospasm' || breathSounds.includes('Wheezing');
      const isCurareCleft = (tofCount >= 1 || muscleTone > 20) && bagVent === 'vent';
      const baselineCo2 = 0; // Standard non-rebreathing

      // I:E ratio ~1:2 (Inspiration = 33% of breath, Expiration = 67% of breath)
      if (tau < 0.33) {
        // Phase I: Inspiration (clean fresh gas at 0 mmHg)
        return baselineCo2;
      } else if (tau < 0.45) {
        // Phase II: Expiratory upstroke (anatomical dead space clears)
        const u = (tau - 0.33) / 0.12;
        if (isSharkFin) {
          // Delayed, slow upward curve with loss of sharp corner
          return baselineCo2 + etco2Val * 0.42 * Math.pow(u, 2.2);
        } else {
          // Sharp sigmoidal upstroke
          return baselineCo2 + etco2Val * 0.90 * Math.pow(Math.sin((Math.PI * u) / 2), 2);
        }
      } else if (tau < 0.90) {
        // Phase III: Alveolar plateau
        const u = (tau - 0.45) / 0.45;
        if (isSharkFin) {
          // Classic ascending shark-fin slope!
          return baselineCo2 + etco2Val * (0.42 + 0.58 * u);
        } else {
          // Normal slight positive slope reaching exact EtCO2 at end of plateau
          let p = baselineCo2 + etco2Val * (0.90 + 0.10 * u);

          // Curare Cleft: diaphragmatic contraction twitch during plateau
          if (isCurareCleft && u >= 0.32 && u <= 0.68) {
            const cleftFrac = (u - 0.32) / 0.36;
            const dip = Math.min(14, etco2Val * 0.32);
            p -= Math.sin(cleftFrac * Math.PI) * dip;
          }
          return p;
        }
      } else {
        // Phase 0: Rapid inspiratory downstroke back to baseline
        const u = (tau - 0.90) / 0.10;
        return baselineCo2 + etco2Val * Math.pow(Math.cos((Math.PI * u) / 2), 2);
      }
    };

    // =========================================================================
    // MAIN OSCILLOSCOPE SWEEP LOOP
    // =========================================================================
    const render = (now: number) => {
      const dt = Math.min(0.06, (now - lastTimeRef.current) / 1000) * (isPausedRef.current ? 0 : timeScaleRef.current);
      lastTimeRef.current = now;

      // Real-time parameters from current refs
      const curPhys = physRef.current;
      const curVent = ventRef.current;
      const curMon = monitoringRef.current;
      const hr = Math.max(0, curPhys.hr);

      // Compute cardiac beat duration and arrhythmia characteristics
      const isAsystole = curPhys.rhythm === 'Asystole' || hr === 0;
      const isVF = curPhys.rhythm === 'Ventricular Fibrillation (VF)';
      const isAF = curPhys.rhythm === 'Atrial Fibrillation';
      const isPVC = curPhys.rhythm === 'Premature Ventricular Contractions (PVCs)';

      const meanBeatSec = hr > 0 ? 60 / hr : 1.0;
      let curBeatSec = meanBeatSec;

      // Arrhythmic RR variation
      if (isAF) {
        // Irregularly irregular RR intervals
        const afJitter = 0.8 + 0.4 * Math.sin(beatIndexRef.current * 17.13 + 5.2);
        curBeatSec = meanBeatSec * afJitter;
      } else if (isPVC) {
        // Premature beat every 5th beat followed by compensatory pause
        const isPremature = beatIndexRef.current % 5 === 0;
        const isCompensatory = (beatIndexRef.current - 1) % 5 === 0;
        if (isPremature) curBeatSec = meanBeatSec * 0.72;
        else if (isCompensatory) curBeatSec = meanBeatSec * 1.28;
      }

      // Advance continuous cardiac & breath clocks
      if (!isPausedRef.current && dt > 0) {
        cardiacTimeRef.current += dt;
        breathTimeRef.current += dt;

        // Check for new cardiac beat index increment
        if (cardiacTimeRef.current >= (beatIndexRef.current + 1) * curBeatSec) {
          beatIndexRef.current += 1;
        }
      }

      // Respiration period
      const effectiveRR = Math.max(1, curPhys.rr);
      const breathSec = 60 / effectiveRR;
      const breathPhase = ((breathTimeRef.current % breathSec) / breathSec) * Math.PI * 2;

      // QRS Pitch Audio Beep (modulated by SpO2!)
      const timeInBeat = cardiacTimeRef.current % curBeatSec;
      const rPeakTime = Math.min(0.22, curBeatSec * 0.28);
      const isNearRPeak = Math.abs(timeInBeat - rPeakTime) < 0.035;

      if (
        isNearRPeak &&
        now - lastHeartBeatTimeRef.current > curBeatSec * 720 &&
        !isAsystole &&
        !isVF &&
        curPhys.rhythm !== 'Pulseless Electrical Activity (PEA)' &&
        (curMon?.spo2Attached ?? true) &&
        curPhys.spo2 > 0
      ) {
        lastHeartBeatTimeRef.current = now;
        audioEngine.playQrsBeep(curPhys.spo2);
      }

      // Sweep movement (Clinical 25 mm/s standard ≈ 95 px/s)
      const sweepSpeed = 95;
      const dx = sweepSpeed * dt;
      const prevX = cursorXRef.current;
      const curX = (prevX + dx) % width;
      cursorXRef.current = curX;

      // Clear the erase bar ahead of the leading beam
      const eraseWidth = 22;
      ctx.fillStyle = '#030712';
      ctx.fillRect(curX, 0, eraseWidth, height);
      if (curX + eraseWidth > width) {
        ctx.fillRect(0, 0, (curX + eraseWidth) - width, height);
      }

      // Channel vertical geometry (4 equal channels)
      const chHeight = height / 4;
      const ecgBaseY = chHeight * 0.65;
      const ecgScale = chHeight * 0.44; // 1.0 mV scale height

      const plethBaseY = chHeight * 1.90;
      const plethAmpHeight = chHeight * 0.74;

      const artZeroY = chHeight * 2.92;
      const artTopY = chHeight * 2.08;
      const artRangeH = artZeroY - artTopY;

      const co2ZeroY = chHeight * 3.92;
      const co2TopY = chHeight * 3.08;
      const co2RangeH = co2ZeroY - co2TopY;

      // Helper to compute (x, y) for all 4 channels at any given clock time
      const computeChannelPoints = (xPos: number, tCard: number, tBr: number) => {
        const isCurrentPvc = isPVC && beatIndexRef.current % 5 === 0;

        // 1. ECG
        const ecgAttached = curMon?.ecgAttached ?? true;
        let ecgY = ecgBaseY;
        if (ecgAttached) {
          const ecgMv = getEcgMv(
            tCard,
            curBeatSec,
            curPhys.rhythm,
            curPhys.stElevationMm,
            curPhys.potassiumMeqL,
            isCurrentPvc
          );
          ecgY = ecgBaseY - ecgMv * ecgScale;
        }

        // 2. Pleth
        const spo2Attached = curMon?.spo2Attached ?? true;
        let plethY = plethBaseY;
        if (spo2Attached) {
          const plethNorm = getPlethNorm(
            tCard,
            curBeatSec,
            curPhys.spo2,
            curPhys.bloodVolumeMl,
            curPhys.map,
            curPhys.dbp,
            breathPhase,
            curPhys.rhythm
          );
          plethY = plethBaseY - plethNorm * plethAmpHeight;
        }

        // 3. Arterial Line
        const artAttached = curMon?.artLineAttached ?? true;
        let artY = artZeroY;
        if (artAttached) {
          const artP = getArtPressureMmHg(
            tCard,
            curBeatSec,
            curPhys.sbp,
            curPhys.dbp,
            curPhys.bloodVolumeMl,
            breathPhase,
            curPhys.rhythm
          );
          artY = artZeroY - (Math.max(0, Math.min(220, artP)) / 200) * artRangeH;
        }

        // 4. Capnogram
        const etco2Attached = curMon?.etco2Attached ?? true;
        let co2Y = co2ZeroY;
        if (etco2Attached) {
          const co2P = getEtCo2MmHg(
            tBr,
            breathSec,
            curPhys.etco2,
            curPhys.airwayPatency,
            curPhys.breathSounds,
            curPhys.tofCount,
            curPhys.muscleTonePercent,
            curVent.bagVentSwitch,
            curVent.powerOn,
            effectiveRR
          );
          co2Y = co2ZeroY - (Math.max(0, Math.min(65, co2P)) / 60) * co2RangeH;
        }

        return { ecgY, plethY, artY, co2Y };
      };

      // Draw continuous segments with sub-pixel stepping to guarantee sharp R peaks
      const drawStepSegment = (xStart: number, xEnd: number, tCardStart: number, tCardEnd: number, tBrStart: number, tBrEnd: number) => {
        const spanPx = Math.max(1, Math.ceil(xEnd - xStart));
        
        ctx.lineWidth = 1.9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Arrays of points for the 4 traces
        const ptsEcg: { x: number; y: number }[] = [];
        const ptsPleth: { x: number; y: number }[] = [];
        const ptsArt: { x: number; y: number }[] = [];
        const ptsCo2: { x: number; y: number }[] = [];

        for (let s = 0; s <= spanPx; s++) {
          const frac = s / spanPx;
          const x = xStart + frac * (xEnd - xStart);
          const tC = tCardStart + frac * (tCardEnd - tCardStart);
          const tB = tBrStart + frac * (tBrEnd - tBrStart);
          const { ecgY, plethY, artY, co2Y } = computeChannelPoints(x, tC, tB);

          ptsEcg.push({ x, y: ecgY });
          ptsPleth.push({ x, y: plethY });
          ptsArt.push({ x, y: artY });
          ptsCo2.push({ x, y: co2Y });
        }

        // Draw Channel 1: ECG (Green)
        ctx.strokeStyle = '#22c55e';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ptsEcg.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();

        // Draw Channel 2: Pleth (Cyan)
        ctx.strokeStyle = '#06b6d4';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ptsPleth.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();

        // Draw Channel 3: Arterial Line (Red)
        ctx.strokeStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ptsArt.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();

        // Draw Channel 4: Capnogram (Yellow)
        ctx.strokeStyle = '#eab308';
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ptsCo2.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();

        ctx.shadowBlur = 0; // Reset shadow
      };

      // Perform drawing: handle smooth wrap-around with zero screen streaks
      if (curX >= prevX) {
        drawStepSegment(prevX, curX, cardiacTimeRef.current - dt, cardiacTimeRef.current, breathTimeRef.current - dt, breathTimeRef.current);
      } else {
        // Wrap-around event: Split into [prevX, width] and [0, curX]
        const dt1 = dt * ((width - prevX) / ((width - prevX) + curX));
        const dt2 = dt - dt1;

        drawStepSegment(prevX, width, cardiacTimeRef.current - dt, cardiacTimeRef.current - dt2, breathTimeRef.current - dt, breathTimeRef.current - dt2);
        drawStepSegment(0, curX, cardiacTimeRef.current - dt2, cardiacTimeRef.current, breathTimeRef.current - dt2, breathTimeRef.current);
      }

      // Leading beam glowing pips
      const leadingPts = computeChannelPoints(curX, cardiacTimeRef.current, breathTimeRef.current);
      ctx.beginPath();
      ctx.fillStyle = '#4ade80';
      ctx.arc(curX, leadingPts.ecgY, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = '#22d3ee';
      ctx.arc(curX, leadingPts.plethY, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = '#f87171';
      ctx.arc(curX, leadingPts.artY, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = '#facc15';
      ctx.arc(curX, leadingPts.co2Y, 2.2, 0, Math.PI * 2);
      ctx.fill();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      resizeObserver.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Compute live visual alert cues for overlays
  const isBronchospasm = phys.airwayPatency === 'bronchospasm' || phys.breathSounds.includes('Wheezing');
  const isCurareCleft = (phys.tofCount >= 1 || phys.muscleTonePercent > 20) && vent.bagVentSwitch === 'vent';
  const isHyperkalemiaT = phys.potassiumMeqL > 5.5;
  const isHypovolemicSwing = phys.bloodVolumeMl < 4000;
  const isArtAttached = monitoring?.artLineAttached ?? false;

  return (
    <div className="relative w-full h-full bg-[#030712] overflow-hidden rounded-lg border border-slate-800 shadow-inner select-none font-mono">
      
      {/* ======================================================== */}
      {/* BACKGROUND CALIBRATION GRID & SCALE OVERLAYS */}
      {/* ======================================================== */}
      <div className="absolute inset-0 pointer-events-none flex flex-col z-0">
        
        {/* Channel 1: ECG Lead II (Top 25%) */}
        <div className="h-1/4 border-b border-slate-800/80 relative">
          {/* 1mV Calibration bracket at left */}
          <div className="absolute left-2.5 top-[32%] h-[42%] flex items-center border-l-2 border-t-2 border-b-2 border-emerald-500/40 w-1.5">
            <span className="text-[8px] text-emerald-400/60 ml-2 font-bold whitespace-nowrap">1 mV</span>
          </div>
        </div>

        {/* Channel 2: Pleth (SpO2) (25% - 50%) */}
        <div className="h-1/4 border-b border-slate-800/80 relative">
          <div className="absolute right-3 top-2 text-[10px] text-cyan-400/70 font-semibold">
            SpO2 {phys.spo2}%
          </div>
        </div>

        {/* Channel 3: Arterial Line (50% - 75%) with 0-200 mmHg Calibrated Scale */}
        <div className="h-1/4 border-b border-slate-800/80 relative">
          {/* Calibrated Ticks & Dotted Gridlines: 200, 150, 100, 50 mmHg */}
          <div className="absolute left-2 top-[6%] text-[9px] text-rose-500/70 font-bold">200</div>
          <div className="absolute left-7 right-2 top-[10%] border-t border-dotted border-rose-950/70" />

          <div className="absolute left-2 top-[29%] text-[9px] text-rose-500/70 font-bold">150</div>
          <div className="absolute left-7 right-2 top-[33%] border-t border-dotted border-rose-950/70" />

          <div className="absolute left-2 top-[52%] text-[9px] text-rose-500/70 font-bold">100</div>
          <div className="absolute left-7 right-2 top-[56%] border-t border-dotted border-rose-950/70" />

          <div className="absolute left-2 top-[74%] text-[9px] text-rose-500/70 font-bold">50</div>
          <div className="absolute left-7 right-2 top-[78%] border-t border-dotted border-rose-950/70" />

          <div className="absolute right-3 top-1.5 text-[10px] text-rose-400/80 font-bold">
            {isArtAttached ? `ART ${phys.sbp}/${phys.dbp} (MAP ${phys.map})` : '[ART NOT MONITORED]'}
          </div>
        </div>

        {/* Channel 4: Capnography (75% - 100%) with 0-60 mmHg Calibrated Scale */}
        <div className="h-1/4 relative">
          {/* Calibrated Ticks: 60, 40, 20 mmHg */}
          <div className="absolute left-2 top-[8%] text-[9px] text-amber-500/70 font-bold">60</div>
          <div className="absolute left-6 right-2 top-[12%] border-t border-dotted border-amber-950/70" />

          <div className="absolute left-2 top-[39%] text-[9px] text-amber-500/70 font-bold">40</div>
          <div className="absolute left-6 right-2 top-[43%] border-t border-dotted border-amber-950/70" />

          <div className="absolute left-2 top-[69%] text-[9px] text-amber-500/70 font-bold">20</div>
          <div className="absolute left-6 right-2 top-[73%] border-t border-dotted border-amber-950/70" />

          <div className="absolute right-3 top-1.5 text-[10px] text-amber-400/80 font-bold">
            EtCO2 {phys.etco2} mmHg | RR {phys.rr}
          </div>
        </div>
      </div>

      {/* Active Waveform Oscilloscope Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block z-10" />

      {/* CRT Scanline / Phosphor Filter */}
      <div className="absolute inset-0 scanline-grid pointer-events-none opacity-25 z-20" />

      {/* ======================================================== */}
      {/* CHANNEL STATUS LABELS & CLINICAL ABNORMALITY CALLOUTS */}
      {/* ======================================================== */}
      
      {/* Channel 1: ECG Header */}
      <div className="absolute top-1.5 left-8 z-30 flex items-center gap-2 text-[10.5px] font-semibold pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-emerald-400">II (ECG 1.0mV) — {phys.rhythm}</span>
        {phys.stElevationMm !== 0 && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
            phys.stElevationMm > 0 ? 'bg-red-950 text-red-300 border border-red-500/50' : 'bg-blue-950 text-blue-300 border border-blue-500/50'
          }`}>
            ST {phys.stElevationMm > 0 ? `+${phys.stElevationMm.toFixed(1)}` : phys.stElevationMm.toFixed(1)} mm
          </span>
        )}
        {isHyperkalemiaT && (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/50 animate-pulse">
            PEAKED T-WAVES (K+ {phys.potassiumMeqL.toFixed(1)})
          </span>
        )}
      </div>

      {/* Channel 2: Pleth Header */}
      <div className="absolute top-[26.5%] left-3 z-30 flex items-center gap-2 text-[10.5px] font-semibold pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-cyan-500" />
        <span className="text-cyan-400">Pleth (SpO2)</span>
        {isHypovolemicSwing && (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/50">
            PVI SWING (Delta-POP)
          </span>
        )}
      </div>

      {/* Channel 3: ART Header */}
      <div className="absolute top-[51.5%] left-7 z-30 flex items-center gap-2 text-[10.5px] font-semibold pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-rose-500" />
        <span className="text-rose-400">ART (Radial Line, mmHg)</span>
        {isHypovolemicSwing && isArtAttached && (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/50">
            PPV SWING
          </span>
        )}
        {!isArtAttached && (
          <span className="text-slate-500 text-[9px] italic">
            [Transducer inactive — Attach in Monitoring tab]
          </span>
        )}
      </div>

      {/* Channel 4: CO2 Header */}
      <div className="absolute top-[76.5%] left-7 z-30 flex items-center gap-2 text-[10.5px] font-semibold pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span className="text-amber-400">CO2 Capnogram (mmHg)</span>
        {isBronchospasm && (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/50 animate-pulse">
            SHARK-FIN OBSERVED (Bronchospasm)
          </span>
        )}
        {isCurareCleft && !isBronchospasm && (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-500/50">
            CURARE CLEFT (Spontaneous Breathing)
          </span>
        )}
        {phys.airwayPatency === 'esophageal_intubated' && (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-950 text-red-300 border border-red-500 animate-pulse">
            ESOPHAGEAL INTUBATION (Flatline)
          </span>
        )}
      </div>

    </div>
  );
};
