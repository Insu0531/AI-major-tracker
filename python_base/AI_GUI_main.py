import datetime
import itertools
import re
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox
import requests

API_COURSE = "https://knuin.knu.ac.kr/public/web/stddm/lsspr/syllabus/lectPlnInqr/selectListLectPlnInqr"

SEMESTER_CODES = {
    "1": "CMBS001400001",
    "2": "CMBS001400002",
    "s": "CMBS001400004",
    "w": "CMBS001400003",
}

COURSES_JSON = [
    ("1", "CAIB0227", "인공지능수학1 (전공필수)", "3-3-0"),
    ("1", "COME0301", "이산수학 (전공필수)", "3-3-0"),
    ("1", "CAIB0229", "프로그래밍 기초와 실습 (전공필수)", "4-3-2"),
    ("1", "COMP0453", "컴퓨팅사고와 SW코딩 (전공필수)", "4-4-0"),
    ("1", "CAIB0236", "인터넷과웹기초 (전공필수)", "3-3-0"),
    ("1", "ELEC0253", "전기전자일반", "3-3-0"),
    ("2", "CAIB0226", "데이터분석 기초 (전공필수)", "3-3-0"),
    ("2", "CAIB0207", "기계학습입문 (전공필수)", "3-3-0"),
    ("2", "CAIB0228", "인공지능 기초와 활용 (전공필수)", "3-3-0"),
    ("2", "CAIB0230", "문제해결과 알고리즘 (전공필수)", "3-3-0"),
    ("2", "CAIB0231", "인공지능수학2 (전공필수)", "3-3-0"),
    ("2", "CAIB0234", "신경망개론 (전공필수)", "3-3-0"),
    ("2", "CAIB0237", "객체프로그래밍과 실습 (전공필수)", "4-3-2"),
    ("2", "CAIB0242", "생물정보학 기초", "3-3-0"),
    ("2", "COMP0324", "인공지능", "3-3-0"),
    ("2", "CROS0216", "로봇제어1", "3-3-0"),
    ("2", "CROS0218", "로봇운영체제 실습", "3-2-2"),
    ("2", "CROS0219", "모델링 및 시뮬레이션", "3-2-2"),
    ("2", "ITEC0419", "데이터과학기초", "3-3-0"),
    ("2", "ITEC0514", "뇌인지공학개론", "3-3-0"),
    ("3", "CAIB0221", "패턴인식기초 (전공필수)", "3-3-0"),
    ("3", "CAIB0208", "학부연구프로젝트 1 (인공지능전공)", "6-4-4"),
    ("3", "COMP0325", "알고리즘 (전공필수)", "3-3-0"),
    ("3", "CAIB0232", "지식표현과 추론", "3-3-0"),
    ("3", "COMP0455", "지능HCI", "3-3-0"),
    ("3", "CAIB0233", "영상이해", "3-3-0"),
    ("3", "ELEC0323", "마이크로프로세서", "3-3-0"),
    ("3", "CAIB0238", "인공지능세미나특강 (전공필수)", "3-3-0"),
    ("3", "MOBI0224", "딥러닝", "3-3-0"),
    ("4", "CAIB0211", "자연어처리개론", "3-3-0"),
    ("4", "CAIB0216", "강화학습개론", "3-3-0"),
    ("4", "CAIB0219", "AI융합 캡스톤디자인 (전공필수)", "3-2-2"),
    ("4", "CAIB0220", "AI하드웨어기초", "3-3-0"),
    ("4", "CAIB0222", "인공지능시스템", "3-3-0"),
    ("4", "CAIB0225", "음성인식", "3-3-0"),
    ("4", "CAIB0235", "딥러닝프로그래밍실습", "3-2-2"),
    ("4", "CAIB0239", "AI클라우드컴퓨팅", "3-3-0"),
    ("4", "CAIB0241", "의료영상인공지능", "3-3-0"),
    ("4", "CAIB0240", "비지도학습", "3-3-0"),
    ("4", "CAIB0243", "인과추론과AI", "3-3-0"),
    ("4", "ELEC0483", "센서와액츄에이터", "3-3-0"),
    ("4", "ITEC0424", "컴퓨터비전", "3-3-0"),
]

DAY_KOR = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5}
DAY_LABEL = ["월", "화", "수", "목", "금", "토"]

BLOCK_COLORS = [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
]


def parse_semester(text: str):
    text = text.strip()
    m = re.match(r"^(\d{4})-([12sw])$", text, re.IGNORECASE)
    if not m:
        return None
    return m.group(1), SEMESTER_CODES[m.group(2).lower()]


def clean_name(name: str) -> str:
    return re.sub(r"<[^>]+>", "", name or "").strip()


def parse_times(time_str: str) -> list[tuple[int, float, float]]:
    """'월 10:30 ~ 12:00,수 13:30 ~ 15:00' → [(0, 10.5, 12.0), (2, 13.5, 15.0)]"""
    slots = []
    for part in time_str.split(","):
        part = part.strip()
        m = re.match(r"([월화수목금토])\s+(\d+):(\d+)\s*~\s*(\d+):(\d+)", part)
        if m:
            day = DAY_KOR[m.group(1)]
            start = int(m.group(2)) + int(m.group(3)) / 60
            end = int(m.group(4)) + int(m.group(5)) / 60
            slots.append((day, start, end))
    return slots


def times_overlap(a: list, b: list) -> bool:
    for (da, sa, ea) in a:
        for (db, sb, eb) in b:
            if da == db and sa < eb and sb < ea:
                return True
    return False


def fetch_sections(year: str, semester: str, sbjet_cd: str, session: requests.Session) -> list[dict]:
    payload = {
        "search": {
            "estblYear": year, "estblSmstrSctcd": semester, "sbjetCd": sbjet_cd,
            "sbjetNm": "", "estblDprtnCd": "", "sbjetSctcd": "", "sbjetSctcd2": "",
            "sbjetRelmCd": "", "crgePrfssNm": "", "bldngCd": "", "bldngNm": "",
            "bldngSn": "", "lssnsLcttmUntcd": "", "rmtCrseYn": "", "rltmCrseYn": "",
            "flplnCrseYn": "", "prctsExrmnYn": "", "dgGbDstrcRmtCrseYn": "",
            "pstinNtnnvRmtCrseYn": "", "riseRmtCrseYn": "", "cltreHmntsCltreYn": "",
            "knuFtrDesigYn": "", "sdgCltreYn": "", "sugrdEvltnYn": "",
            "lctreLnggeSctcd": "ko", "rprsnLctreLnggeSctcd": "",
            "isApi": "Y", "gubun": "01", "contents": sbjet_cd,
        }
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "isajax": "true",
        "Referer": "https://knuin.knu.ac.kr/public/stddm/lectPlnInqr.knu",
        "Origin": "https://knuin.knu.ac.kr",
    }
    try:
        resp = session.post(API_COURSE, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, list) else (data.get("data") or [])
    except Exception:
        return []


WINDOW_SIZES = {
    "소형  (900 × 600)":  (900,  600),
    "중형  (1100 × 700)": (1100, 700),
    "대형  (1300 × 800)": (1300, 800),
    "특대형 (1600 × 900)": (1600, 900),
}
DEFAULT_SIZE = "중형  (1100 × 700)"


# ── 시간표 격자 캔버스 ─────────────────────────────────────────
class TimetableCanvas(tk.Canvas):
    START_H = 9.0
    END_H = 22.0
    COL_W = 80
    ROW_H = 40
    LABEL_W = 40

    def __init__(self, master, **kw):
        self._ch = int((self.END_H - self.START_H) * self.ROW_H) + 30
        self._cw = self.LABEL_W + len(DAY_LABEL) * self.COL_W
        self._sections = []
        super().__init__(master, bg="white", width=self._cw, height=self._ch,
                         scrollregion=(0, 0, self._cw, self._ch), **kw)
        self._draw_grid()

    def _draw_grid(self):
        self.delete("grid")
        # 요일 헤더
        for i, d in enumerate(DAY_LABEL):
            x = self.LABEL_W + i * self.COL_W + self.COL_W // 2
            self.create_text(x, 15, text=d, font=("맑은 고딕", 9, "bold"), tags="grid")
        # 시간 행
        hours = int(self.END_H - self.START_H)
        for h in range(hours + 1):
            y = 30 + h * self.ROW_H
            self.create_line(0, y, self.LABEL_W + len(DAY_LABEL) * self.COL_W, y,
                             fill="#ddd", tags="grid")
            t = int(self.START_H + h)
            self.create_text(self.LABEL_W // 2, y + 2, text=f"{t:02d}:00",
                             font=("맑은 고딕", 7), anchor="n", tags="grid")
        # 세로선
        for i in range(len(DAY_LABEL) + 1):
            x = self.LABEL_W + i * self.COL_W
            self.create_line(x, 30, x, 30 + hours * self.ROW_H, fill="#ddd", tags="grid")

    def draw_sections(self, sections: list[dict]):
        self._sections = sections
        self.delete("block")
        self._tooltip_data = {}

        # 1단계: 같은 과목·같은 요일 슬롯 병합 → (si, day) → (merged_start, merged_end)
        merged: dict = {}
        for si, sec in enumerate(sections):
            for (day, start, end) in sec["times"]:
                key = (si, day)
                if key not in merged:
                    merged[key] = (start, end)
                else:
                    ms, me = merged[key]
                    merged[key] = (min(ms, start), max(me, end))

        # 2단계: (name, day, start, end)가 동일한 블록은 교수 이름만 합치기
        # slot_key → {color, name, time_str, profs: set}
        slot_map: dict = {}
        for (si, day), (start, end) in merged.items():
            sec = sections[si]
            slot_key = (sec["name"], day, start, end)
            if slot_key not in slot_map:
                slot_map[slot_key] = {
                    "color": sec["color"],
                    "name": sec["name"],
                    "time_str": sec["time_str"],
                    "profs": [sec["prof"]],
                }
            else:
                if sec["prof"] not in slot_map[slot_key]["profs"]:
                    slot_map[slot_key]["profs"].append(sec["prof"])

        # 3단계: 블록 그리기
        for (name, day, start, end), info in slot_map.items():
            color = info["color"]
            profs = info["profs"]
            time_str = info["time_str"]
            prof_str = " / ".join(profs)

            x1 = self.LABEL_W + day * self.COL_W + 2
            x2 = self.LABEL_W + (day + 1) * self.COL_W - 2
            y1 = 30 + (start - self.START_H) * self.ROW_H
            y2 = 30 + (end - self.START_H) * self.ROW_H

            short_name = name.split("(")[0].strip()
            rect = self.create_rectangle(x1, y1, x2, y2, fill=color,
                                         outline="white", width=2, tags="block")
            txt = self.create_text((x1 + x2) / 2, (y1 + y2) / 2,
                                   text=short_name,
                                   font=("맑은 고딕", 7, "bold"), fill="white",
                                   width=max(1, int(x2 - x1 - 2)),
                                   tags="block")
            tooltip = f"{name}\n{prof_str}\n{time_str}"
            self._tooltip_data[rect] = tooltip
            self._tooltip_data[txt] = tooltip

        self.configure(scrollregion=(0, 0, self._cw, self._ch))
        self._setup_tooltip()

    def _setup_tooltip(self):
        self.unbind("<Motion>")
        self._tip_win = None
        self._tip_item = None  # 현재 툴팁이 떠 있는 캔버스 항목 ID

        def on_motion(event):
            item = self.find_closest(event.x, event.y)
            item_id = item[0] if item else None
            tip_text = self._tooltip_data.get(item_id) if item_id else None

            if tip_text:
                if item_id != self._tip_item:
                    # 다른 블록으로 이동했을 때만 팝업 갱신
                    _hide_tip()
                    self._tip_item = item_id
                    _show_tip(event, tip_text)
                else:
                    # 같은 블록 내 이동: 팝업 위치만 업데이트
                    if self._tip_win:
                        x = self.winfo_rootx() + event.x + 12
                        y = self.winfo_rooty() + event.y + 12
                        self._tip_win.wm_geometry(f"+{x}+{y}")
            else:
                _hide_tip()

        def _show_tip(event, text):
            x = self.winfo_rootx() + event.x + 12
            y = self.winfo_rooty() + event.y + 12
            self._tip_win = tw = tk.Toplevel(self)
            tw.wm_overrideredirect(True)
            tw.wm_geometry(f"+{x}+{y}")
            tk.Label(tw, text=text, justify="left",
                     background="#fffbe6", relief="solid", borderwidth=1,
                     font=("맑은 고딕", 8), padx=6, pady=4).pack()

        def _hide_tip():
            self._tip_item = None
            if self._tip_win:
                self._tip_win.destroy()
                self._tip_win = None

        self.bind("<Motion>", on_motion)
        self.bind("<Leave>", lambda _: _hide_tip())


# ── 메인 앱 ───────────────────────────────────────────────────
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("경북대 AI전공 개설과목 조회")
        self.resizable(False, False)
        w, h = WINDOW_SIZES[DEFAULT_SIZE]
        self.geometry(f"{w}x{h}")
        self._results = []       # (grade, crseNo, name, dept, prof, time_str)
        self._sort_state = {}
        self._combos = []        # 전체 생성 조합
        self._filtered_combos = []  # 필터 적용 후 조합
        self._combo_idx = 0
        self._check_vars = {}
        self._build_ui()

    # ── UI 구성 ──────────────────────────────────────────────
    def _build_ui(self):
        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True)
        self._nb = nb

        self._tab_query = tk.Frame(nb)
        self._tab_wizard = tk.Frame(nb)
        self._tab_settings = tk.Frame(nb)
        nb.add(self._tab_query, text="  개설과목 조회  ")
        nb.add(self._tab_wizard, text="  시간표 마법사  ")
        nb.add(self._tab_settings, text="  설정  ")

        self._build_query_tab()
        self._build_wizard_tab()
        self._build_settings_tab()
        w, _ = WINDOW_SIZES[DEFAULT_SIZE]
        self.after(100, lambda: self._relayout(w))

        # 하단 공통 바
        bottom = tk.Frame(self)
        bottom.pack(fill="x", padx=12, pady=4)
        self.status = tk.Label(bottom, text="학기를 선택하고 조회 버튼을 누르세요.", anchor="w", fg="#444")
        self.status.pack(side="left")
        tk.Label(bottom, text="※ 본 프로그램은 참고용으로만 사용해주세요.  |  made by insu0531", anchor="e", fg="#aaa").pack(side="right")

    def _build_query_tab(self):
        f = self._tab_query
        # 컨트롤
        top = tk.Frame(f, padx=12, pady=10)
        top.pack(fill="x")
        tk.Label(top, text="학기:").pack(side="left")
        default_sem = f"{datetime.date.today().year}-1"
        self.sem_var = tk.StringVar(value=default_sem)
        sem_entry = ttk.Entry(top, textvariable=self.sem_var, width=10)
        sem_entry.pack(side="left", padx=(4, 2))
        sem_entry.bind("<Return>", lambda _: self._start_fetch())
        tk.Label(top, text="(예: 2026-1, 2026-2, 2026-s, 2026-w)", fg="#888").pack(side="left", padx=(0, 16))
        self.btn = ttk.Button(top, text="조회", command=self._start_fetch)
        self.btn.pack(side="left")
        self.progress_label = tk.Label(top, text="", fg="#555")
        self.progress_label.pack(side="left", padx=12)

        # 진행바
        self.pbar = ttk.Progressbar(f, mode="determinate")
        self.pbar.pack(fill="x", padx=12)

        # 테이블
        cols = ("학년", "과목코드", "교과목명", "개설학과", "교수", "강의시간")
        frame = tk.Frame(f)
        frame.pack(fill="both", expand=True, padx=12, pady=(6, 4))
        self.tree = ttk.Treeview(frame, columns=cols, show="headings", selectmode="browse")
        for c in cols:
            self.tree.heading(c, text=c, command=lambda col=c: self._sort_col(col))
            self.tree.column(c, width=100, minwidth=40, stretch=False)
        vsb = ttk.Scrollbar(frame, orient="vertical", command=self.tree.yview)
        hsb = ttk.Scrollbar(frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        vsb.pack(side="right", fill="y")
        hsb.pack(side="bottom", fill="x")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.tag_configure("odd", background="#f7f7f7")
        self.tree.tag_configure("even", background="#ffffff")

    def _build_wizard_tab(self):
        f = self._tab_wizard

        # 안내
        tk.Label(f, text="조회 탭에서 먼저 조회한 뒤, 원하는 과목을 체크하고 '조합 생성'을 누르세요.",
                 fg="#666", pady=6).pack()

        pane = tk.PanedWindow(f, orient="horizontal", sashwidth=5)
        pane.pack(fill="both", expand=True, padx=8, pady=(0, 8))

        # ── 왼쪽: 체크박스 목록 ──
        left = tk.Frame(pane, width=280)
        pane.add(left, minsize=220)

        tk.Label(left, text="과목 선택", font=("맑은 고딕", 9, "bold")).pack(anchor="w", padx=8, pady=(6, 2))

        btn_row = tk.Frame(left)
        btn_row.pack(fill="x", padx=8, pady=2)
        ttk.Button(btn_row, text="전체 선택", command=self._check_all).pack(side="left", padx=(0, 4))
        ttk.Button(btn_row, text="전체 해제", command=self._uncheck_all).pack(side="left")

        scroll_frame = tk.Frame(left)
        scroll_frame.pack(fill="both", expand=True, padx=4)
        vsb2 = ttk.Scrollbar(scroll_frame, orient="vertical")
        vsb2.pack(side="right", fill="y")
        self._check_canvas = tk.Canvas(scroll_frame, yscrollcommand=vsb2.set, highlightthickness=0)
        self._check_canvas.pack(side="left", fill="both", expand=True)
        vsb2.config(command=self._check_canvas.yview)
        self._check_inner = tk.Frame(self._check_canvas)
        self._check_canvas.create_window((0, 0), window=self._check_inner, anchor="nw")
        self._check_inner.bind("<Configure>",
            lambda _: self._check_canvas.configure(scrollregion=self._check_canvas.bbox("all")))

        def _on_check_scroll(event):
            self._check_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        self._check_canvas.bind("<MouseWheel>", _on_check_scroll)
        self._check_inner.bind("<MouseWheel>", _on_check_scroll)

        ttk.Button(left, text="조합 생성", command=self._generate_combos).pack(pady=6)
        self.combo_label = tk.Label(left, text="", fg="#555")
        self.combo_label.pack()

        # ── 필터 영역 ──
        tk.Frame(left, height=1, bg="#ddd").pack(fill="x", padx=8, pady=(8, 4))
        tk.Label(left, text="필수 포함 과목 필터", font=("맑은 고딕", 9, "bold")).pack(anchor="w", padx=8)
        tk.Label(left, text="체크한 과목이 모두 포함된 조합만 표시", fg="#888",
                 font=("맑은 고딕", 7)).pack(anchor="w", padx=8)

        filter_scroll_frame = tk.Frame(left)
        filter_scroll_frame.pack(fill="both", expand=True, padx=4, pady=(2, 0))
        fvsb = ttk.Scrollbar(filter_scroll_frame, orient="vertical")
        fvsb.pack(side="right", fill="y")
        self._filter_canvas = tk.Canvas(filter_scroll_frame, yscrollcommand=fvsb.set,
                                        highlightthickness=0, height=80)
        self._filter_canvas.pack(side="left", fill="both", expand=True)
        fvsb.config(command=self._filter_canvas.yview)
        self._filter_inner = tk.Frame(self._filter_canvas)
        self._filter_canvas.create_window((0, 0), window=self._filter_inner, anchor="nw")
        self._filter_inner.bind("<Configure>",
            lambda _: self._filter_canvas.configure(scrollregion=self._filter_canvas.bbox("all")))

        def _on_filter_scroll(event):
            self._filter_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        self._filter_canvas.bind("<MouseWheel>", _on_filter_scroll)
        self._filter_inner.bind("<MouseWheel>", _on_filter_scroll)
        self._filter_vars = {}  # name → BooleanVar

        ttk.Button(left, text="필터 적용", command=self._apply_filter).pack(pady=(4, 6))
        self.filter_label = tk.Label(left, text="", fg="#555", font=("맑은 고딕", 8))
        self.filter_label.pack()

        # ── 오른쪽: 시간표 격자 ──
        right = tk.Frame(pane)
        pane.add(right, minsize=400)

        nav = tk.Frame(right)
        nav.pack(pady=6)
        ttk.Button(nav, text="◀", width=3, command=self._prev_combo).pack(side="left")
        self.combo_nav_label = tk.Label(nav, text="조합 없음", width=14)
        self.combo_nav_label.pack(side="left", padx=8)
        ttk.Button(nav, text="▶", width=3, command=self._next_combo).pack(side="left")
        self.credit_label = tk.Label(nav, text="", fg="#444", font=("맑은 고딕", 9))
        self.credit_label.pack(side="left", padx=(16, 0))

        tt_frame = tk.Frame(right)
        tt_frame.pack(fill="both", expand=True)
        tt_hsb = ttk.Scrollbar(tt_frame, orient="horizontal")
        tt_vsb = ttk.Scrollbar(tt_frame, orient="vertical")
        tt_hsb.pack(side="bottom", fill="x")
        tt_vsb.pack(side="right", fill="y")
        self.tt_canvas = TimetableCanvas(tt_frame)
        self.tt_canvas.configure(xscrollcommand=tt_hsb.set, yscrollcommand=tt_vsb.set)
        tt_hsb.config(command=self.tt_canvas.xview)
        tt_vsb.config(command=self.tt_canvas.yview)
        self.tt_canvas.pack(side="left", fill="both", expand=True)
        self.tt_canvas.configure(scrollregion=self.tt_canvas.bbox("all"))

    # ── 조회 탭 로직 ─────────────────────────────────────────
    def _start_fetch(self):
        self.btn.config(state="disabled")
        for row in self.tree.get_children():
            self.tree.delete(row)
        self._results = []
        self.pbar["value"] = 0
        self.pbar["maximum"] = len(COURSES_JSON)
        threading.Thread(target=self._fetch_all, daemon=True).start()

    def _fetch_all(self):
        parsed = parse_semester(self.sem_var.get())
        if not parsed:
            self.after(0, lambda: messagebox.showerror("입력 오류", "학기를 '2026-1' 등 형식으로 입력해주세요."))
            self.after(0, lambda: self.btn.config(state="normal"))
            return
        year, semester = parsed
        session = requests.Session()
        results = []
        for i, (grade, code, name, credit) in enumerate(COURSES_JSON, 1):
            self._set_progress(f"[{i}/{len(COURSES_JSON)}] {code} 조회 중...")
            sections = fetch_sections(year, semester, code, session)
            for sec in sections:
                results.append((
                    grade,
                    sec.get("crseNo") or code,
                    clean_name(name),
                    sec.get("estblDprtnNm") or "",
                    sec.get("totalPrfssNm") or "",
                    sec.get("lssnsRealTimeInfo") or "",
                ))
            self.after(0, lambda v=i: self.pbar.configure(value=v))
            time.sleep(0.3)
        self._results = results
        self.after(0, self._render_results)

    def _render_results(self):
        for i, row in enumerate(self._results):
            tag = "odd" if i % 2 else "even"
            self.tree.insert("", "end", values=row, tags=(tag,))
        count = len(self._results)
        self.status.config(text=f"총 {count}개 분반 개설됨 ({self.sem_var.get()})" if count else "개설된 과목이 없습니다.")
        self._set_progress("")
        self.btn.config(state="normal")
        self._refresh_checkboxes()

    def _sort_col(self, col: str):
        COL_NAMES = ("학년", "과목코드", "교과목명", "개설학과", "교수", "강의시간")
        col_idx = COL_NAMES.index(col)
        state = self._sort_state.get(col)

        for c in COL_NAMES:
            self.tree.heading(c, text=c)

        def sort_key(row):
            val = row[col_idx]
            try:
                return (0, int(val))
            except (ValueError, TypeError):
                return (1, str(val))

        if state is None:
            next_state = "asc"
            data = sorted(self._results, key=sort_key)
            self.tree.heading(col, text=f"{col} ▲")
        elif state == "asc":
            next_state = "desc"
            data = sorted(self._results, key=sort_key, reverse=True)
            self.tree.heading(col, text=f"{col} ▼")
        else:
            next_state = None
            data = self._results

        self._sort_state = {col: next_state}
        self.tree.delete(*self.tree.get_children())
        for i, row in enumerate(data):
            self.tree.insert("", "end", values=row, tags=("odd" if i % 2 else "even",))


    def _build_settings_tab(self):
        f = self._tab_settings
        tk.Frame(f, height=30).pack()
        tk.Label(f, text="창 크기", font=("맑은 고딕", 10, "bold")).pack()
        tk.Frame(f, height=12).pack()

        self._size_var = tk.StringVar(value=DEFAULT_SIZE)
        for label in WINDOW_SIZES:
            tk.Radiobutton(f, text=label, variable=self._size_var,
                           value=label, font=("맑은 고딕", 9)).pack(anchor="w", padx=80, pady=3)

        tk.Frame(f, height=16).pack()
        ttk.Button(f, text="적용", command=self._apply_size).pack()

    def _apply_size(self):
        w, h = WINDOW_SIZES[self._size_var.get()]
        self.geometry(f"{w}x{h}")
        self.after(50, lambda: self._relayout(w))

    def _relayout(self, win_w: int):
        # 테이블 컬럼 너비 재조정 (좌측 패널 ~280px 제외)
        col_ratios = {"학년": 0.05, "과목코드": 0.13, "교과목명": 0.23,
                      "개설학과": 0.19, "교수": 0.11, "강의시간": 0.29}
        table_w = win_w - 40
        for col, ratio in col_ratios.items():
            self.tree.column(col, width=max(40, int(table_w * ratio)))

        # 시간표 캔버스 컬럼 너비 재조정
        avail = win_w - 320  # 왼쪽 체크박스 패널 너비 제외
        new_col_w = max(50, avail // len(DAY_LABEL))
        self.tt_canvas.COL_W = new_col_w
        self.tt_canvas._cw = self.tt_canvas.LABEL_W + len(DAY_LABEL) * new_col_w
        self.tt_canvas._draw_grid()
        if self.tt_canvas._sections:
            self.tt_canvas.draw_sections(self.tt_canvas._sections)

    def _set_progress(self, text: str):
        self.after(0, lambda: self.progress_label.config(text=text))

    # ── 시간표 마법사 로직 ────────────────────────────────────
    def _refresh_checkboxes(self):
        for w in self._check_inner.winfo_children():
            w.destroy()
        self._check_vars = {}

        # 과목코드 앞부분(분반 제외)으로 그룹핑
        groups = {}
        for row in self._results:
            grade, crse_no, name, *_ = row
            base_code = crse_no.rsplit("-", 1)[0]  # CAIB0227-001 → CAIB0227
            if base_code not in groups:
                credit_str = next((c for _, cd, _, c in COURSES_JSON if cd == base_code), "0")
                credit = int(credit_str.split("-")[0])
                groups[base_code] = {"name": name, "grade": grade, "credit": credit, "sections": []}
            groups[base_code]["sections"].append(row)

        def _on_check_scroll(event):
            self._check_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        cur_grade = None
        for base_code, info in groups.items():
            if info["grade"] != cur_grade:
                cur_grade = info["grade"]
                lbl = tk.Label(self._check_inner, text=f"── {cur_grade}학년 ──",
                               fg="#888", font=("맑은 고딕", 8))
                lbl.pack(anchor="w", padx=8, pady=(6, 0))
                lbl.bind("<MouseWheel>", _on_check_scroll)

            var = tk.BooleanVar(value=False)
            self._check_vars[base_code] = (var, info)
            n_div = len(info["sections"])
            label = f"{info['name']}  ({n_div}분반)"
            cb = tk.Checkbutton(self._check_inner, text=label, variable=var,
                                anchor="w", font=("맑은 고딕", 8))
            cb.pack(fill="x", padx=12)
            cb.bind("<MouseWheel>", _on_check_scroll)

        self._check_canvas.configure(scrollregion=self._check_canvas.bbox("all"))

    def _check_all(self):
        for var, _ in self._check_vars.values():
            var.set(True)

    def _uncheck_all(self):
        for var, _ in self._check_vars.values():
            var.set(False)

    def _generate_combos(self):
        selected = [(base, info) for base, (var, info) in self._check_vars.items() if var.get()]
        if not selected:
            messagebox.showinfo("안내", "과목을 하나 이상 선택해주세요.")
            return

        # 각 과목의 분반 리스트 준비 (시간 정보 없는 분반 제외)
        # 과목명+시간이 동일한 분반은 하나로 합치고 교수 이름만 모음
        section_groups = []
        for _, info in selected:
            slot_map = {}  # (name, time_str) → merged section
            for row in info["sections"]:
                time_str = row[5]
                times = parse_times(time_str)
                if not times:
                    continue
                key = (row[2], time_str)  # (과목명, 강의시간)
                if key not in slot_map:
                    slot_map[key] = {"crse_no": row[1], "name": row[2],
                                     "profs": [row[4]], "time_str": time_str, "times": times,
                                     "credit": info.get("credit", 0)}
                else:
                    if row[4] not in slot_map[key]["profs"]:
                        slot_map[key]["profs"].append(row[4])
            if slot_map:
                section_groups.append(list(slot_map.values()))

        if not section_groups:
            messagebox.showinfo("안내", "시간 정보가 있는 분반이 없습니다.")
            return

        # 모든 조합 생성 후 시간 겹치는 조합 제거
        def has_overlap(combo):
            slots = []
            for sec in combo:
                for (day, start, end) in sec["times"]:
                    for (d2, s2, e2) in slots:
                        if day == d2 and start < e2 and end > s2:
                            return True
                    slots.append((day, start, end))
            return False

        # 크기별로 유효 조합 수집 후, 최대 크기 + 최대 크기의 부분집합이 아닌 소규모 조합 포함
        n_groups = len(section_groups)
        valid_by_size = {}  # size → [(idx_set, combo), ...]
        for size in range(n_groups, 0, -1):
            found = []
            for idx_subset in itertools.combinations(range(n_groups), size):
                sub_groups = [section_groups[i] for i in idx_subset]
                for c in itertools.product(*sub_groups):
                    combo = list(c)
                    if not has_overlap(combo):
                        found.append((set(idx_subset), combo))
            if found:
                valid_by_size[size] = found

        all_combos = []
        if valid_by_size:
            max_size = max(valid_by_size.keys())
            max_idx_sets = [idx_set for idx_set, _ in valid_by_size[max_size]]
            # 최대 크기 조합 전부 포함
            all_combos = [combo for _, combo in valid_by_size[max_size]]
            # 작은 크기는 최대 크기의 부분집합이 아닌 경우만 포함
            for size in range(max_size - 1, 0, -1):
                for idx_set, combo in valid_by_size.get(size, []):
                    if not any(idx_set <= ms for ms in max_idx_sets):
                        all_combos.append(combo)

        self._combos = all_combos
        self._filtered_combos = all_combos
        self._combo_idx = 0

        # 필터 체크박스 갱신: 이번 조합에 등장하는 과목명 목록
        for w in self._filter_inner.winfo_children():
            w.destroy()
        self._filter_vars = {}
        names_seen = []
        for combo in all_combos:
            for sec in combo:
                if sec["name"] not in names_seen:
                    names_seen.append(sec["name"])
        def _on_filter_scroll2(event):
            self._filter_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        for name in names_seen:
            var = tk.BooleanVar(value=False)
            self._filter_vars[name] = var
            cb = tk.Checkbutton(self._filter_inner, text=name.split("(")[0].strip(),
                                variable=var, anchor="w", font=("맑은 고딕", 8))
            cb.pack(fill="x", padx=8)
            cb.bind("<MouseWheel>", _on_filter_scroll2)
        self._filter_canvas.configure(scrollregion=self._filter_canvas.bbox("all"))
        self.filter_label.config(text="")

        n = len(all_combos)
        self.combo_label.config(text=f"전체 조합: {n}개")
        if n == 0:
            self.combo_nav_label.config(text="조합 없음")
            self.tt_canvas.delete("block")
        else:
            self._show_combo(0)
            self._nb.select(self._tab_wizard)

    def _apply_filter(self):
        required = [name for name, var in self._filter_vars.items() if var.get()]
        if not required:
            self._filtered_combos = self._combos
            self.filter_label.config(text="필터 없음 (전체 표시)")
        else:
            self._filtered_combos = [
                combo for combo in self._combos
                if all(any(sec["name"] == r for sec in combo) for r in required)
            ]
            self.filter_label.config(text=f"필터 결과: {len(self._filtered_combos)}개")
        self._combo_idx = 0
        n = len(self._filtered_combos)
        if n == 0:
            self.combo_nav_label.config(text="조합 없음")
            self.tt_canvas.delete("block")
        else:
            self._show_combo(0)

    def _show_combo(self, idx: int):
        if not self._filtered_combos:
            return
        combo = self._filtered_combos[idx]
        n = len(self._filtered_combos)
        self.combo_nav_label.config(text=f"{idx + 1} / {n}")

        total_credit = sum(sec.get("credit", 0) for sec in combo)
        self.credit_label.config(text=f"총 {total_credit}학점")

        sections_vis = []
        for i, sec in enumerate(combo):
            sections_vis.append({
                "name": sec["name"],
                "prof": " / ".join(sec["profs"]),
                "time_str": sec["time_str"],
                "color": BLOCK_COLORS[i % len(BLOCK_COLORS)],
                "times": sec["times"],
            })
        self.tt_canvas.draw_sections(sections_vis)

    def _prev_combo(self):
        if self._filtered_combos:
            self._combo_idx = (self._combo_idx - 1) % len(self._filtered_combos)
            self._show_combo(self._combo_idx)

    def _next_combo(self):
        if self._filtered_combos:
            self._combo_idx = (self._combo_idx + 1) % len(self._filtered_combos)
            self._show_combo(self._combo_idx)


if __name__ == "__main__":
    app = App()
    app.mainloop()
