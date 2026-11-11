"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import Icon from "./Icon";

/** 피드백/응원 (새 디자인). 같은 구글 폼(entry ID)으로 보낸다. 전공·학번은 1단계 내 정보를 그대로 */
const FORM_ACTION = "https://docs.google.com/forms/d/e/1FAIpQLSc6VyJCdBAmc2olMVcSBrC2FN0iNMoCqPPXIfQHzE_Ew1145g/formResponse";
const CATEGORIES = ["기능 추가 문의", "버그 신고", "UI/UX(디자인) 개선", "응원"] as const;

export default function PlannerFeedback({ majorLabel, entryYear }: { majorLabel: string; entryYear: number }) {
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [withProfile, setWithProfile] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  const send = async () => {
    if (!category) return setErr("어떤 내용인지 골라 주세요.");
    if (!content.trim() && category !== "응원") return setErr("내용을 적어 주세요.");
    if (!agreed) return setErr("개인정보 수집·이용에 동의해 주세요.");
    setErr("");
    setStatus("sending");
    const body = new FormData();
    if (withProfile && majorLabel) body.append("entry.431703091", majorLabel);
    if (withProfile && entryYear) body.append("entry.308308418", String(entryYear));
    body.append("entry.879413792", category);
    body.append("entry.195170706", content);
    try {
      await fetch(FORM_ACTION, { method: "POST", body, mode: "no-cors" });
      setStatus("done");
      track("feedback_sent", { category });
      setContent(""); setCategory(""); setAgreed(false);
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="pl-fb pl-fb-done">
        <div className="pl-fb-check" aria-hidden><Icon name="check" /></div>
        <b>보내 주셔서 고마워요!</b>
        <div className="pl-hint">꼼꼼히 읽고 서비스에 반영할게요.</div>
        <button className="pl-btn" onClick={() => setStatus("idle")}>하나 더 보내기</button>
      </div>
    );
  }

  return (
    <div className="pl-fb">
      <div className="pl-hint">버그, 기능 제안, 응원 무엇이든 좋아요. 답장이 필요하면 내용에 연락처를 남겨 주세요.</div>
      <div>
        <div className="pl-label">어떤 내용인가요?</div>
        <div className="pl-chips">
          {CATEGORIES.map((c) => <button key={c} className="pl-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}
        </div>
      </div>
      <div>
        <div className="pl-label">내용</div>
        <textarea className="pl-field pl-fb-text" rows={6} value={content} onChange={(e) => setContent(e.target.value)}
          placeholder={category === "버그 신고" ? "어느 화면에서 무엇을 눌렀을 때 어떻게 됐는지 적어 주세요" : "자유롭게 적어 주세요"} />
      </div>
      <label className="pl-fb-check-row">
        <input type="checkbox" checked={withProfile} onChange={(e) => setWithProfile(e.target.checked)} />
        내 정보 같이 보내기 <span className="pl-muted">({[majorLabel || "학과 없음", entryYear ? `${entryYear}학번` : ""].filter(Boolean).join(" | ")})</span>
      </label>
      <div className="pl-fb-privacy">
        수집 항목: 학과·학번(선택), 문의 내용 | 목적: 서비스 개선과 답변 | 보유: 목적 달성 후 파기
      </div>
      <label className="pl-fb-check-row">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        개인정보 수집·이용에 동의해요
      </label>
      {err && <div className="pl-fb-err" role="alert">{err}</div>}
      {status === "error" && <div className="pl-fb-err" role="alert">보내지 못했어요. 잠시 후 다시 시도해 주세요.</div>}
      <button className="pl-btn primary lg" disabled={status === "sending"} onClick={send}>{status === "sending" ? "보내는 중…" : "보내기"}</button>
    </div>
  );
}
