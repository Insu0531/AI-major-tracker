"""기존 전공 + 에너지 전공 2026년 JSON 일괄 생성"""
import subprocess, sys

majors = [
    # # (학과코드, key, 라벨, base코드)
    # ("1301","math","수학과",None),
    # ("1302","chem","화학과",None),
    # ("1304","stat","통계학과",None),
    # ("1611","energy","에너지공학부",None),
    # ("161101","energy_re","에너지공학부-신재생에너지전공","1611"),
    # # ("161102", "energy_cv", "에너지공학부-에너지변환전공",   "1611"),
    # # 130Q 지구시스템과학부
    # ("130Q01","geo_geol","지질학전공","130Q"),
    # ("130Q02","geo_astro","천문대기과학전공","130Q"),
    # ("130Q03","geo_ocean","해양학전공","130Q"),
    # ("1101","kor_lit","국어국문학과",None),
    # ("1102","eng_lit","영어영문학과",None),
    # ("1103","fre_lit","불어불문학과",None),
    # ("1104","ger_lit","독어독문학과",None),
    # ("1105","chi_lit","중어중문학과",None),
    # ("1106","history","사학과",None),
    # ("1107","philosophy","철학과",None),
    # ("1108","anthro","고고인류학과",None),
    # ("1109","jpn_lit","일어일문학과",None),
    # ("110A","kor_clas","한문학과",None),
    # ("110B","rus_lit","노어노문학과",None),
    # # 1200 사회과학대학
    # ("1201","poli_sci","정치외교학과",None),
    # ("1202","sociology","사회학과",None),
    # ("1203","geography","지리학과",None),
    # ("1204","doc_info","문헌정보학과",None),
    # ("1205","psychology","심리학과",None),
    # ("120D","media_commu","미디어커뮤니케이션학과",None),
    # ("1403","business","경영학부",None),
    # ("1404","econ","경제통상학부",None),
    # ("1601","mech","기계공학부",None),
    # ("1605","polymer","고분자공학과",None),
    # ("1606","env_eng","환경공학과",None),
    # ("1607","textile","섬유시스템공학과",None),
    # ("1617","metal_mat","금속재료공학과",None),
    # ("1703","agri_civil","농업토목공학과",None),
    # ("170B01","plant_sci","응용생명과학부-식물생명과학전공","170B"),
    # ("170B04","env_life_chem","응용생명과학부-환경생명화학전공","170B"),
    # ("170P01","food_biotech","식품공학부-식품생물공학전공","170P"),
    # ("170P02","food_mat","식품공학부-식품소재공학전공","170P"),
    # ("170P03","food_app","식품공학부-식품응용공학전공","170P"),
    # ("170Y","plant_med","식물의학과",None),
    # ("170Z","food_econ","식품자원경제학과",None),
    # ("1711","smart_bio_mech","스마트생물산업기계공학과",None),
    # # 19 사범대학
    # ("1901","edu","교육학과",None),
    # ("1902","kor_edu","국어교육과",None),
    # ("1903","eng_edu","영어교육과",None),
    # ("1907","ethics_edu","윤리교육과",None),
    # ("1908","math_edu","수학교육과",None),
    # ("190A","home_edu","가정교육과",None),
    # # 190D 유럽어교육학부
    # ("190D01","ger_edu","유럽어교육학부-독어교육전공","190D"),
    # ("190D02","fre_edu","유럽어교육학부-불어교육전공","190D"),
    # ("190E","history_edu","역사교육과",None),
    # ("190F","geo_edu","지리교육과",None),
    # ("190G","social_edu","일반사회교육과",None),
    # ("190H","phys_edu","물리교육과",None),
    # ("190I","chem_edu","화학교육과",None),
    # ("190J","bio_edu","생물교육과",None),
    # ("190K","earth_edu","지구과학교육과",None),
    # # 1B 생활과학대학
    # ("1B03","clothing","의류학과",None),
    # ("1B04","food_nutrition","식품영양학과",None),
    # ("1B0701","child_dev","아동학부-아동가족학전공","1B07"),
    # ("1B0702","child_edu","아동학부-아동교육전공","1B07"),
    # # 1S01 행정학부
    # ("1S0101","pub_admin","행정학부-공공관리전공","1S01"),
    # ("1S0102","pub_policy","행정학부-공공정책전공","1S01"),
    # # 10 첨단기술융합대학
    # ("100101","bio_med_eng","의생명융합공학전공","1001"),
    # ("100102","robot_smart","로봇및스마트시스템공학전공","1001"),
    # ("100103","h2_energy","수소및신재생에너지전공","1001"),
    # ("1002","smart_mobility","스마트모빌리티공학과",None),
    # ("1003","space","우주공학부",None),
    # ("1004","innov_pharma","혁신신약학과",None),
    # ("1005","bio_med_fusion","의생명융합공학과",None),
    # ("1006","robotics","로봇공학과",None),
    # ("1007","adv_tech_self1","첨단기술융합대학 자율학부1",None),
    # ("1008","adv_tech_self2","첨단기술융합대학 자율학부2",None),
    # ("1009","auto_fusion","자율시스템 융합전공",None),
    # 1002 컴퓨터학부
    # ("1O0201","cs_know","컴퓨터학부-지식정보컴퓨팅전공","1O02"),
    # ("1O0202","cs_sw_conv","컴퓨터학부-융합소프트웨어전공","1O02"),
    # ("1O0203","cs_sys_sw","컴퓨터학부-시스템소프트웨어전공","1O02"),
    # ("1O0204","cs_global_sw","컴퓨터학부-글로벌소프트웨어융합전공","1O02"),
    # ("1O0205","cs_platform","컴퓨터학부-플랫폼소프트웨어전공","1O02"),
    # ("1O0206","cs_data","컴퓨터학부-데이터과학전공","1O02"),
    # ("1O0207","cs_human_ai","컴퓨터학부-인간중심소프트웨어전공","1O02"),
    # ("1O0208","cs_ai_comp","컴퓨터학부-인공지능컴퓨팅전공","1O02"),
    # ("1O0209","cs_deep","컴퓨터학부-심화컴퓨팅전공","1O02"),
    # ("1O0210","cs_adv","컴퓨터학부-첨단컴퓨팅연구전공","1O02"),
    # # 1O01 전자공학부
    # ("1O01","elec","전자공학부",None),
    # ("1O0109","ai","전자공학부 인공지능전공","1O01"),
#     # 1T 융합학부
#     ("1T0101","ai_conv","융합학부-인공지능전공","1T01"),
#     ("1T0102","bio_med_conv","융합학부-의생명융합공학전공","1T01"),
#     ("1T0103","robot_conv","융합학부-로봇및스마트시스템공학전공","1T01"),
#     ("1T0104","h2_conv","융합학부-수소및신재생에너지전공","1T01"),
    # ("130M","bio_eng","생명공학부",None),
    # 1618/1609 신소재공학
    # ("1618","new_mat","신소재공학과(24학번~)",None),
    # ("1609","new_mat_div","신소재공학부(~23학번)",None),
    # ("160904","new_mat_elec","신소재공학부-전자재료공학전공(~23학번)",None),
    # ("170Y","plant_med","식물의학과",None),
    # ("170Q","bio_sum_sojae","바이오섬유소재학과",None),
    # ── 상주캠퍼스 1U (공학계열) ──────────────────────────────
    # 학년 완전 분리 → --base 사용
    # ("1U0101","sj_civil_disaster","[상주]건설방재공학전공","1U01"),
    # ("1U0102","sj_civil_env","[상주]건설환경공학전공","1U01"),
    # ("1U0301","sj_eco_auto","[상주]친환경자동차전공","1U03"),
    # ("1U0302","sj_smart_auto","[상주]지능형자동차전공","1U03"),
    # ("1U0701","sj_mat_nano","[상주]신소재공학전공","1U07"),
    # ("1U0703","sj_echem_nano","[상주]에너지화공전공","1U07"),
    # ("1U0I01","sj_aerospace","[상주]항공위성시스템전공","1U0I"),
    # ("1U0I02","sj_plant_sys","[상주]플랜트시스템전공","1U0I"),
    # ("1U0N01","sj_mat_energy","[상주]신소재공학전공","1U0N"),
    # ("1U0N03","sj_echem_energy","[상주]에너지화학공학전공","1U0N"),
    # # 단독 학과
    # ("1U02","sj_precision_mech","[상주]정밀기계공학과",None),
    # ("1U08","sj_food_service","[상주]식품외식산업학과",None),
    # ("1U0A01","sj_textile","[상주]섬유공학전공",None),
    # ("1U0A02","sj_fashion","[상주]패션디자인전공",None),
    # ("1U0D","sj_ind_mech","[상주]산업기계공학과",None),
    # ("1U0F","sj_civil_disaster_dept","[상주]건설방재공학과",None),
    # ("1U0G","sj_env_safety","[상주]환경안전공학과",None),
    # ("1U0J","sj_dental_hyg","[상주]치위생학과",None),
    # ("1U0K","sj_sw","[상주]소프트웨어학과",None),
    # ("1U0L","sj_gis","[상주]위치정보시스템학과",None),
    # ("1U0M","sj_smart_plant","[상주]스마트플랜트공학과",None),
    # ("1U0O","sj_auto","[상주]자동차공학과",None),
    # ("1U0P","sj_nano_mat","[상주]나노신소재공학과",None),
    # ("1U0Q","sj_energy_chem","[상주]에너지화학공학과",None),
    # # ── 상주캠퍼스 1L (자연계열) ──────────────────────────────
    # ("1L04","sj_livestock","[상주]축산학과",None),
    ("1L05","sj_leisure_sports","[상주]레저스포츠학과",None),
    # ("1L0601","sj_bio_app","[상주]생물응용전공",None),
    # ("1L0603","sj_eco_tour","[상주]생태관광전공",None),
    # ("1L09","sj_livestock_biotech","[상주]축산생명공학과",None),
    # ("1L0A","sj_insect","[상주]곤충생명과학과",None),
    # ("1L0B","sj_tourism","[상주]관광학과",None),
    # ("1L10","sj_horse","[상주]말특수동물학과",None),
    # ("1L11","sj_livestock_startup","[상주]축산창업전공",None),
    # ("1L12","sj_forest_eco","[상주]산림생태보호학과",None),
    # ("1L13","sj_plant_res","[상주]식물자원학과",None),
    # ("1L14","sj_phys_edu","[상주]체육학과",None),
    # ("1L15","sj_animal_biotech","[상주]동물생명공학과",None),
    # ("1L1601","sj_phys_edu_major","[상주]체육학전공",None),
    # ("1L1602","sj_health_sports","[상주]건강운동관리전공",None),
    # ("1604","chem_eng","화학공학과",None),
    # 1209 사회복지학부
    # ("120901","social_welfare_micro","사회복지미시전공","1209"),
    # ("120902","social_welfare_macro","사회복지거시전공","1209"),
    # ("1209","social_welfare","사회복지학부",None),
    # ("1C01", "nursing", "간호학과", None),
    # ("1F01", "medical", "의학과", None),
    # ("1F04", "medical-semi", "의예과", None),
    # ("1G01", 'dentist', '치의학과', None),
    # ("1G02", 'dentist-semi', '치의예과', None)
    # ("1O03", 'eleceng', '전기공학과', None),
    # ("1612", "appli_chem", "응용화학공학부", None),
    # 1612 응용화학공학부 하위 전공
    # ("1612001", "appli_chem_a", "응용화학공학부A", "1612"),
    # ("1612002", "appli_chem_b", "응용화학공학부B", "1612"),
    # ("161201",  "appli_chem_major", "응용화학공학부-응용화학전공", "1612"),
    # ("161202",  "appli_chem_eng",   "응용화학공학부-화학공학전공", "1612"),
    # ("191I", 'computer_edu', '정보컴퓨터교육과', None)
    # 170S 산림과학·조경학부 (base=1학년, 세부전공=2~4학년)
    # ("170S01", "forestry",       "산림과학·조경학부-임학전공",     "170S"),
    # ("170S02", "forest_prod_eng","산림과학·조경학부-임산공학전공", "170S"),
    # ("170S03", "landscape_arch", "산림과학·조경학부-조경학전공",   "170S"),
    # 1309 생물학과 / 130A 물리학과
    # ("1309", "biology", "생물학과", None),
    # ("130A", "physics", "물리학과", None),
    # 1800 예술대학
    # ("1801", "music",         "음악학과",           None),
    # ("1803", "korean_music2", "국악학과",           None),
    # ("1804", "art",           "미술학과",           None),
    # ("1806", "design",        "디자인학과",         None),
    # ("1807", "digital_art",   "디지털아트융합전공", None),
    # ("110K", "PPE",   "정치-경제-철학(PPE)융합전공", None),
    # ("170O", "wonye", "원예과학과", None)
 ]

years = "2021,2022,2023,2024,2025,2026"

for dept_cd, key, label, base in majors:
    cmd = [sys.executable, "add_major.py", dept_cd, key, label, "--years", years]
    if base:
        cmd += ["--base", base]
    print(f"\n{'='*60}")
    print(f"실행: {' '.join(cmd)}")
    subprocess.run(cmd, encoding="utf-8")
