'use client';

/**
 * WorkspaceCanvasClient — integration component that wires all the
 * picker bodies + analysis panels into the WorkspaceCanvas chrome.
 *
 * Phase F6 of the one-canvas redesign. The new top-level workspace
 * page (`/my/workspace/[id]/page.tsx`) renders this single client
 * component; layout.tsx still owns the server-rendered hero +
 * AskPanel mounting.
 *
 * Picker body slot resolution:
 *   subjects  → SubjectsBrowser  (refactored in F3)
 *   sessions  → SessionsBrowser  (refactored in F3)
 *   probes    → ProbesPicker     (new in F3)
 *   stimuli   → StimuliPicker    (new in F3)
 *   documents → DocumentsPicker  (new in F3 — replaces StructureBrowser navigate-out)
 *
 * Analyses grid slot resolution: all 9 panels from
 * `components/workspace/` (each refactored in F5 to read selection
 * from useWorkspaceSelection).
 *
 * Panel order in the grid (left-to-right, top-to-bottom):
 *   1. Signal viewer            — `session` driven
 *   2. Behavioral track         — `session` driven (XY trajectory, time-colored, Haley H11)
 *   3. Patch-clamp step family  — `session` driven (NaN-gap segmentation, Francesconi D8)
 *   4. PSTH                     — `unit` + `stimulus` driven
 *   5. Spike activity           — `unit` driven
 *   6. Behavioral compare       — dataset-wide
 *   7. Treatment timeline       — dataset-wide
 *   8. Electrode positions      — dataset-wide (auto-loads on mount)
 *   9. Video playback           — `session` driven (Bhar B10, Haley H12)
 *
 * Dataset structure / class browser is NOT a panel here — it lives
 * inside the Documents picker tab in the rail.
 */
import { BehavioralComparePanel } from '@/components/workspace/BehavioralComparePanel';
import { BehavioralTrackPanel } from '@/components/workspace/BehavioralTrackPanel';
import { ElectrodePositionPanel } from '@/components/workspace/ElectrodePositionPanel';
import { PatchClampStepFamilyPanel } from '@/components/workspace/PatchClampStepFamilyPanel';
import { PsthPanel } from '@/components/workspace/PsthPanel';
import { SignalViewerPanel } from '@/components/workspace/SignalViewerPanel';
import { SpikeActivityPanel } from '@/components/workspace/SpikeActivityPanel';
import { TreatmentTimelinePanel } from '@/components/workspace/TreatmentTimelinePanel';
import { VideoPlaybackPanel } from '@/components/workspace/VideoPlaybackPanel';
import { DocumentsPicker } from '@/components/workspace/canvas/DocumentsPicker';
import { ProbesPicker } from '@/components/workspace/canvas/ProbesPicker';
import { StimuliPicker } from '@/components/workspace/canvas/StimuliPicker';
import { SubjectsBrowser } from '@/components/workspace/SubjectsBrowser';
import { SessionsBrowser } from '@/components/workspace/SessionsBrowser';

import { AnalysesGrid } from './AnalysesGrid';
import { SnapshotSection } from './SnapshotSection';
import { WorkspaceCanvas } from './WorkspaceCanvas';

export interface WorkspaceCanvasClientProps {
  datasetId: string;
}

export function WorkspaceCanvasClient({
  datasetId,
}: WorkspaceCanvasClientProps) {
  const pickerSlots = {
    subjects: <SubjectsBrowser datasetId={datasetId} />,
    sessions: <SessionsBrowser datasetId={datasetId} />,
    probes: <ProbesPicker datasetId={datasetId} />,
    stimuli: <StimuliPicker datasetId={datasetId} />,
    documents: <DocumentsPicker datasetId={datasetId} />,
  } as const;

  const analyses = [
    <SignalViewerPanel key="signal" datasetId={datasetId} />,
    <BehavioralTrackPanel key="behavioral-track" datasetId={datasetId} />,
    <PatchClampStepFamilyPanel key="patch-clamp" datasetId={datasetId} />,
    <PsthPanel key="psth" datasetId={datasetId} />,
    <SpikeActivityPanel key="spike" datasetId={datasetId} />,
    <BehavioralComparePanel key="behavior" datasetId={datasetId} />,
    <TreatmentTimelinePanel key="treatment" datasetId={datasetId} />,
    <ElectrodePositionPanel key="electrode" datasetId={datasetId} />,
    <VideoPlaybackPanel key="video" datasetId={datasetId} />,
  ];

  return (
    <WorkspaceCanvas
      datasetId={datasetId}
      pickerSlots={pickerSlots}
      snapshot={<SnapshotSection datasetId={datasetId} />}
      analyses={<AnalysesGrid panels={analyses} />}
    />
  );
}
