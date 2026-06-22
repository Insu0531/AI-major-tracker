const FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSchgSvBu_QGAcy0OMYt70nJYhFeLoDpHF52BFseUqEiFGvw3A/formResponse";

export function trackSave({
  event,
  majorLabel,
  extraMajorLabels = [],
  entryYear,
}: {
  event: "이미지 저장" | "라이브러리 저장";
  majorLabel: string;
  extraMajorLabels?: string[];
  entryYear?: number;
}) {
  const body = new FormData();
  body.append("entry.1718935567", event);
  body.append("entry.1701017629", majorLabel);
  if (extraMajorLabels[0]) body.append("entry.55830767", extraMajorLabels[0]);
  if (extraMajorLabels[1]) body.append("entry.1546014654", extraMajorLabels[1]);
  if (extraMajorLabels[2]) body.append("entry.199931837", extraMajorLabels[2]);
  if (entryYear) body.append("entry.628443133", String(entryYear));
  fetch(FORM_ACTION, { method: "POST", body, mode: "no-cors" }).catch(() => {});
}