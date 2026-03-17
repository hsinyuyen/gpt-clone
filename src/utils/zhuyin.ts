import pinyin from "pinyin";

// Complete pinyin syllable to zhuyin mapping
const pinyinToZhuyin: Record<string, string> = {
  // A
  a: "ㄚ", ai: "ㄞ", an: "ㄢ", ang: "ㄤ", ao: "ㄠ",
  // B
  ba: "ㄅㄚ", bai: "ㄅㄞ", ban: "ㄅㄢ", bang: "ㄅㄤ", bao: "ㄅㄠ",
  bei: "ㄅㄟ", ben: "ㄅㄣ", beng: "ㄅㄥ", bi: "ㄅㄧ", bian: "ㄅㄧㄢ",
  biao: "ㄅㄧㄠ", bie: "ㄅㄧㄝ", bin: "ㄅㄧㄣ", bing: "ㄅㄧㄥ", bo: "ㄅㄛ", bu: "ㄅㄨ",
  // C
  ca: "ㄘㄚ", cai: "ㄘㄞ", can: "ㄘㄢ", cang: "ㄘㄤ", cao: "ㄘㄠ",
  ce: "ㄘㄜ", cen: "ㄘㄣ", ceng: "ㄘㄥ", ci: "ㄘ", cong: "ㄘㄨㄥ",
  cou: "ㄘㄡ", cu: "ㄘㄨ", cuan: "ㄘㄨㄢ", cui: "ㄘㄨㄟ", cun: "ㄘㄨㄣ", cuo: "ㄘㄨㄛ",
  // CH
  cha: "ㄔㄚ", chai: "ㄔㄞ", chan: "ㄔㄢ", chang: "ㄔㄤ", chao: "ㄔㄠ",
  che: "ㄔㄜ", chen: "ㄔㄣ", cheng: "ㄔㄥ", chi: "ㄔ", chong: "ㄔㄨㄥ",
  chou: "ㄔㄡ", chu: "ㄔㄨ", chua: "ㄔㄨㄚ", chuai: "ㄔㄨㄞ", chuan: "ㄔㄨㄢ",
  chuang: "ㄔㄨㄤ", chui: "ㄔㄨㄟ", chun: "ㄔㄨㄣ", chuo: "ㄔㄨㄛ",
  // D
  da: "ㄉㄚ", dai: "ㄉㄞ", dan: "ㄉㄢ", dang: "ㄉㄤ", dao: "ㄉㄠ",
  de: "ㄉㄜ", dei: "ㄉㄟ", den: "ㄉㄣ", deng: "ㄉㄥ", di: "ㄉㄧ",
  dia: "ㄉㄧㄚ", dian: "ㄉㄧㄢ", diao: "ㄉㄧㄠ", die: "ㄉㄧㄝ", ding: "ㄉㄧㄥ",
  diu: "ㄉㄧㄡ", dong: "ㄉㄨㄥ", dou: "ㄉㄡ", du: "ㄉㄨ", duan: "ㄉㄨㄢ",
  dui: "ㄉㄨㄟ", dun: "ㄉㄨㄣ", duo: "ㄉㄨㄛ",
  // E
  e: "ㄜ", ei: "ㄟ", en: "ㄣ", eng: "ㄥ", er: "ㄦ",
  // F
  fa: "ㄈㄚ", fan: "ㄈㄢ", fang: "ㄈㄤ", fei: "ㄈㄟ", fen: "ㄈㄣ",
  feng: "ㄈㄥ", fo: "ㄈㄛ", fou: "ㄈㄡ", fu: "ㄈㄨ",
  // G
  ga: "ㄍㄚ", gai: "ㄍㄞ", gan: "ㄍㄢ", gang: "ㄍㄤ", gao: "ㄍㄠ",
  ge: "ㄍㄜ", gei: "ㄍㄟ", gen: "ㄍㄣ", geng: "ㄍㄥ", gong: "ㄍㄨㄥ",
  gou: "ㄍㄡ", gu: "ㄍㄨ", gua: "ㄍㄨㄚ", guai: "ㄍㄨㄞ", guan: "ㄍㄨㄢ",
  guang: "ㄍㄨㄤ", gui: "ㄍㄨㄟ", gun: "ㄍㄨㄣ", guo: "ㄍㄨㄛ",
  // H
  ha: "ㄏㄚ", hai: "ㄏㄞ", han: "ㄏㄢ", hang: "ㄏㄤ", hao: "ㄏㄠ",
  he: "ㄏㄜ", hei: "ㄏㄟ", hen: "ㄏㄣ", heng: "ㄏㄥ", hong: "ㄏㄨㄥ",
  hou: "ㄏㄡ", hu: "ㄏㄨ", hua: "ㄏㄨㄚ", huai: "ㄏㄨㄞ", huan: "ㄏㄨㄢ",
  huang: "ㄏㄨㄤ", hui: "ㄏㄨㄟ", hun: "ㄏㄨㄣ", huo: "ㄏㄨㄛ",
  // J
  ji: "ㄐㄧ", jia: "ㄐㄧㄚ", jian: "ㄐㄧㄢ", jiang: "ㄐㄧㄤ", jiao: "ㄐㄧㄠ",
  jie: "ㄐㄧㄝ", jin: "ㄐㄧㄣ", jing: "ㄐㄧㄥ", jiong: "ㄐㄩㄥ", jiu: "ㄐㄧㄡ",
  ju: "ㄐㄩ", juan: "ㄐㄩㄢ", jue: "ㄐㄩㄝ", jun: "ㄐㄩㄣ",
  // K
  ka: "ㄎㄚ", kai: "ㄎㄞ", kan: "ㄎㄢ", kang: "ㄎㄤ", kao: "ㄎㄠ",
  ke: "ㄎㄜ", kei: "ㄎㄟ", ken: "ㄎㄣ", keng: "ㄎㄥ", kong: "ㄎㄨㄥ",
  kou: "ㄎㄡ", ku: "ㄎㄨ", kua: "ㄎㄨㄚ", kuai: "ㄎㄨㄞ", kuan: "ㄎㄨㄢ",
  kuang: "ㄎㄨㄤ", kui: "ㄎㄨㄟ", kun: "ㄎㄨㄣ", kuo: "ㄎㄨㄛ",
  // L
  la: "ㄌㄚ", lai: "ㄌㄞ", lan: "ㄌㄢ", lang: "ㄌㄤ", lao: "ㄌㄠ",
  le: "ㄌㄜ", lei: "ㄌㄟ", leng: "ㄌㄥ", li: "ㄌㄧ", lia: "ㄌㄧㄚ",
  lian: "ㄌㄧㄢ", liang: "ㄌㄧㄤ", liao: "ㄌㄧㄠ", lie: "ㄌㄧㄝ", lin: "ㄌㄧㄣ",
  ling: "ㄌㄧㄥ", liu: "ㄌㄧㄡ", lo: "ㄌㄛ", long: "ㄌㄨㄥ", lou: "ㄌㄡ",
  lu: "ㄌㄨ", luan: "ㄌㄨㄢ", lun: "ㄌㄨㄣ", luo: "ㄌㄨㄛ",
  lv: "ㄌㄩ", lve: "ㄌㄩㄝ", lvn: "ㄌㄩㄣ",
  // M
  ma: "ㄇㄚ", mai: "ㄇㄞ", man: "ㄇㄢ", mang: "ㄇㄤ", mao: "ㄇㄠ",
  me: "ㄇㄜ", mei: "ㄇㄟ", men: "ㄇㄣ", meng: "ㄇㄥ", mi: "ㄇㄧ",
  mian: "ㄇㄧㄢ", miao: "ㄇㄧㄠ", mie: "ㄇㄧㄝ", min: "ㄇㄧㄣ", ming: "ㄇㄧㄥ",
  miu: "ㄇㄧㄡ", mo: "ㄇㄛ", mou: "ㄇㄡ", mu: "ㄇㄨ",
  // N
  na: "ㄋㄚ", nai: "ㄋㄞ", nan: "ㄋㄢ", nang: "ㄋㄤ", nao: "ㄋㄠ",
  ne: "ㄋㄜ", nei: "ㄋㄟ", nen: "ㄋㄣ", neng: "ㄋㄥ", ni: "ㄋㄧ",
  nian: "ㄋㄧㄢ", niang: "ㄋㄧㄤ", niao: "ㄋㄧㄠ", nie: "ㄋㄧㄝ", nin: "ㄋㄧㄣ",
  ning: "ㄋㄧㄥ", niu: "ㄋㄧㄡ", nong: "ㄋㄨㄥ", nou: "ㄋㄡ", nu: "ㄋㄨ",
  nuan: "ㄋㄨㄢ", nuo: "ㄋㄨㄛ", nv: "ㄋㄩ", nve: "ㄋㄩㄝ",
  // O
  o: "ㄛ", ou: "ㄡ",
  // P
  pa: "ㄆㄚ", pai: "ㄆㄞ", pan: "ㄆㄢ", pang: "ㄆㄤ", pao: "ㄆㄠ",
  pei: "ㄆㄟ", pen: "ㄆㄣ", peng: "ㄆㄥ", pi: "ㄆㄧ", pian: "ㄆㄧㄢ",
  piao: "ㄆㄧㄠ", pie: "ㄆㄧㄝ", pin: "ㄆㄧㄣ", ping: "ㄆㄧㄥ", po: "ㄆㄛ",
  pou: "ㄆㄡ", pu: "ㄆㄨ",
  // Q
  qi: "ㄑㄧ", qia: "ㄑㄧㄚ", qian: "ㄑㄧㄢ", qiang: "ㄑㄧㄤ", qiao: "ㄑㄧㄠ",
  qie: "ㄑㄧㄝ", qin: "ㄑㄧㄣ", qing: "ㄑㄧㄥ", qiong: "ㄑㄩㄥ", qiu: "ㄑㄧㄡ",
  qu: "ㄑㄩ", quan: "ㄑㄩㄢ", que: "ㄑㄩㄝ", qun: "ㄑㄩㄣ",
  // R
  ran: "ㄖㄢ", rang: "ㄖㄤ", rao: "ㄖㄠ", re: "ㄖㄜ", ren: "ㄖㄣ",
  reng: "ㄖㄥ", ri: "ㄖ", rong: "ㄖㄨㄥ", rou: "ㄖㄡ", ru: "ㄖㄨ",
  rua: "ㄖㄨㄚ", ruan: "ㄖㄨㄢ", rui: "ㄖㄨㄟ", run: "ㄖㄨㄣ", ruo: "ㄖㄨㄛ",
  // S
  sa: "ㄙㄚ", sai: "ㄙㄞ", san: "ㄙㄢ", sang: "ㄙㄤ", sao: "ㄙㄠ",
  se: "ㄙㄜ", sen: "ㄙㄣ", seng: "ㄙㄥ", si: "ㄙ", song: "ㄙㄨㄥ",
  sou: "ㄙㄡ", su: "ㄙㄨ", suan: "ㄙㄨㄢ", sui: "ㄙㄨㄟ", sun: "ㄙㄨㄣ", suo: "ㄙㄨㄛ",
  // SH
  sha: "ㄕㄚ", shai: "ㄕㄞ", shan: "ㄕㄢ", shang: "ㄕㄤ", shao: "ㄕㄠ",
  she: "ㄕㄜ", shei: "ㄕㄟ", shen: "ㄕㄣ", sheng: "ㄕㄥ", shi: "ㄕ",
  shou: "ㄕㄡ", shu: "ㄕㄨ", shua: "ㄕㄨㄚ", shuai: "ㄕㄨㄞ", shuan: "ㄕㄨㄢ",
  shuang: "ㄕㄨㄤ", shui: "ㄕㄨㄟ", shun: "ㄕㄨㄣ", shuo: "ㄕㄨㄛ",
  // T
  ta: "ㄊㄚ", tai: "ㄊㄞ", tan: "ㄊㄢ", tang: "ㄊㄤ", tao: "ㄊㄠ",
  te: "ㄊㄜ", teng: "ㄊㄥ", ti: "ㄊㄧ", tian: "ㄊㄧㄢ", tiao: "ㄊㄧㄠ",
  tie: "ㄊㄧㄝ", ting: "ㄊㄧㄥ", tong: "ㄊㄨㄥ", tou: "ㄊㄡ", tu: "ㄊㄨ",
  tuan: "ㄊㄨㄢ", tui: "ㄊㄨㄟ", tun: "ㄊㄨㄣ", tuo: "ㄊㄨㄛ",
  // W
  wa: "ㄨㄚ", wai: "ㄨㄞ", wan: "ㄨㄢ", wang: "ㄨㄤ", wei: "ㄨㄟ",
  wen: "ㄨㄣ", weng: "ㄨㄥ", wo: "ㄨㄛ", wu: "ㄨ",
  // X
  xi: "ㄒㄧ", xia: "ㄒㄧㄚ", xian: "ㄒㄧㄢ", xiang: "ㄒㄧㄤ", xiao: "ㄒㄧㄠ",
  xie: "ㄒㄧㄝ", xin: "ㄒㄧㄣ", xing: "ㄒㄧㄥ", xiong: "ㄒㄩㄥ", xiu: "ㄒㄧㄡ",
  xu: "ㄒㄩ", xuan: "ㄒㄩㄢ", xue: "ㄒㄩㄝ", xun: "ㄒㄩㄣ",
  // Y
  ya: "ㄧㄚ", yan: "ㄧㄢ", yang: "ㄧㄤ", yao: "ㄧㄠ", ye: "ㄧㄝ",
  yi: "ㄧ", yin: "ㄧㄣ", ying: "ㄧㄥ", yo: "ㄧㄛ", yong: "ㄩㄥ",
  you: "ㄧㄡ", yu: "ㄩ", yuan: "ㄩㄢ", yue: "ㄩㄝ", yun: "ㄩㄣ",
  // Z
  za: "ㄗㄚ", zai: "ㄗㄞ", zan: "ㄗㄢ", zang: "ㄗㄤ", zao: "ㄗㄠ",
  ze: "ㄗㄜ", zei: "ㄗㄟ", zen: "ㄗㄣ", zeng: "ㄗㄥ", zi: "ㄗ",
  zong: "ㄗㄨㄥ", zou: "ㄗㄡ", zu: "ㄗㄨ", zuan: "ㄗㄨㄢ", zui: "ㄗㄨㄟ",
  zun: "ㄗㄨㄣ", zuo: "ㄗㄨㄛ",
  // ZH
  zha: "ㄓㄚ", zhai: "ㄓㄞ", zhan: "ㄓㄢ", zhang: "ㄓㄤ", zhao: "ㄓㄠ",
  zhe: "ㄓㄜ", zhei: "ㄓㄟ", zhen: "ㄓㄣ", zheng: "ㄓㄥ", zhi: "ㄓ",
  zhong: "ㄓㄨㄥ", zhou: "ㄓㄡ", zhu: "ㄓㄨ", zhua: "ㄓㄨㄚ", zhuai: "ㄓㄨㄞ",
  zhuan: "ㄓㄨㄢ", zhuang: "ㄓㄨㄤ", zhui: "ㄓㄨㄟ", zhun: "ㄓㄨㄣ", zhuo: "ㄓㄨㄛ",
};

// Tone marks
const toneMarks: Record<string, string> = {
  "1": "",
  "2": "ˊ",
  "3": "ˇ",
  "4": "ˋ",
  "5": "˙",
};

// Convert pinyin syllable to zhuyin (returns { zhuyin, tone })
function pinyinSyllableToZhuyin(pinyinSyllable: string): { zhuyin: string; tone: string } {
  if (!pinyinSyllable) return { zhuyin: "", tone: "" };

  let syllable = pinyinSyllable.toLowerCase();
  let tone = "";

  // Extract tone number
  const toneMatch = syllable.match(/[1-5]$/);
  if (toneMatch) {
    tone = toneMarks[toneMatch[0]] || "";
    syllable = syllable.slice(0, -1);
  }

  // Handle ü variants
  syllable = syllable.replace(/ü/g, "v");

  // Direct lookup
  const zhuyin = pinyinToZhuyin[syllable];
  if (zhuyin) {
    return { zhuyin, tone };
  }

  return { zhuyin: "", tone: "" };
}

// Convert text with Chinese characters to HTML with ruby annotations (vertical style)
export function addZhuyinAnnotations(text: string): string {
  if (!text) return "";

  const result: string[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    // Check if it's a Chinese character
    if (/[\u4e00-\u9fff]/.test(char)) {
      try {
        const pinyinResult = pinyin(char, {
          style: pinyin.STYLE_TONE2,
          heteronym: false,
        });

        if (pinyinResult && pinyinResult[0] && pinyinResult[0][0]) {
          const { zhuyin: zhuyinStr, tone } = pinyinSyllableToZhuyin(pinyinResult[0][0]);
          if (zhuyinStr) {
            result.push(`<span class="zhuyin-char"><span class="char">${char}</span><span class="zhuyin-wrapper"><span class="zhuyin-text">${zhuyinStr}</span><span class="zhuyin-tone">${tone}</span></span></span>`);
          } else {
            result.push(char);
          }
        } else {
          result.push(char);
        }
      } catch {
        result.push(char);
      }
    } else {
      result.push(char);
    }

    i++;
  }

  return result.join("");
}

export default addZhuyinAnnotations;
