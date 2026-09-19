/**
 * MunichTech EXPO 2026 — official judge evidence destination.
 *
 * Google Drive is the AUTHORITATIVE evidence owner for the MunichTech
 * submission. The public site explains the comparison and points here;
 * it does not mirror the evidence pack.
 *
 * JUDGE_EVIDENCE_URL must be the stable shared Drive link to the A/B-8
 * evidence folder. Insert the exact share URL when handed off — the
 * public compare page renders the folder path label until configured.
 */

export const JUDGE_EVIDENCE = {
  // Stable shared Drive folder (Anyone with the link = Viewer):
  //   "MunichTech EXPO 2026 — FINAL Submission & Judge Package /
  //    14 — A/B-8 Release Comparison Evidence — FINAL"
  url: 'https://drive.google.com/drive/folders/1S2gYsgRYr1PMq1fH_CDfxDjXOTbKO-dV',
  folderLabel: 'Google Drive — MunichTech EXPO 2026 · Judge Package',
  artifactPath:
    '14 — A/B-8 Release Comparison Evidence — FINAL / HAIEC-A-B-8-Release-Comparison-Evidence-Pack.zip',
  note: 'Official submission & evidence package lives in the judge Drive folder shared with MunichTech materials.',
} as const;
