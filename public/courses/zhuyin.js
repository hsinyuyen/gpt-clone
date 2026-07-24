/* 低年級注音引擎（共用）— 台灣課本樣式：注音直排在漢字右側。
   來源：l1-character.html，抽出成共用檔給 L2 以後的課使用。
   用法：<script src="/courses/zhuyin.js"></script> 然後呼叫 enableZhuyin()；
        AI 生成的文字帶回注音時，先 zyAddDict({字:'注音'}) 再渲染。 */
(function(){
  var css = `  /* 低年級注音：台灣課本樣式——注音直排在漢字右側，聲調在注音右側、輕聲在上方（比照 P1）。只在 body.zy 生效 */
  .zy .zc{position:relative;display:inline-block;margin-right:1.2em;line-height:1.75;}
  .zy .zb{position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:.1em;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-size:.5em;line-height:1.05;font-weight:500;color:inherit;opacity:.92;
    white-space:nowrap;pointer-events:none;user-select:none;-webkit-user-select:none;}
  .zy .zb .zs{display:block;}
  .zy .zb .zt{position:absolute;left:100%;top:50%;transform:translate(-22%,-50%);font-size:.85em;}
  .zy .zb.light .zt{left:50%;top:0;transform:translate(-50%,-86%);font-size:1em;}
  /* 低年級：注音在字右側佔空間，字級略放大讓注音也看得清楚 */
  .zy .hint{font-size:16px;} .zy .opt,.zy .sp .nm{font-size:16px;} .zy .beatp{font-size:19px;}
  .zy .steptip{font-size:17px;} .zy .lbl,.zy .group>.lbl{font-size:16px;}`;
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

const ZHUYIN={
'一':'ㄧ','三':'ㄙㄢ','上':'ㄕㄤˋ','下':'ㄒㄧㄚˋ','不':'ㄅㄨˋ','中':'ㄓㄨㄥ','主':'ㄓㄨˇ','久':'ㄐㄧㄡˇ','之':'ㄓ','也':'ㄧㄝˇ','乾':'ㄍㄢ',
'了':'˙ㄌㄜ','事':'ㄕˋ','二':'ㄦˋ','五':'ㄨˇ','些':'ㄒㄧㄝ','交':'ㄐㄧㄠ','享':'ㄒㄧㄤˇ','亮':'ㄌㄧㄤˋ','人':'ㄖㄣˊ','什':'ㄕㄣˊ','以':'ㄧˇ',
'件':'ㄐㄧㄢˋ','任':'ㄖㄣˋ','但':'ㄉㄢˋ','低':'ㄉㄧ','住':'ㄓㄨˋ','你':'ㄋㄧˇ','來':'ㄌㄞˊ','個':'ㄍㄜˋ','們':'˙ㄇㄣ','做':'ㄗㄨㄛˋ',
'備':'ㄅㄟˋ','像':'ㄒㄧㄤˋ','元':'ㄩㄢˊ','先':'ㄒㄧㄢ','光':'ㄍㄨㄤ','免':'ㄇㄧㄢˇ','兔':'ㄊㄨˋ','入':'ㄖㄨˋ','全':'ㄑㄩㄢˊ','六':'ㄌㄧㄡˋ',
'共':'ㄍㄨㄥˋ','具':'ㄐㄩˋ','再':'ㄗㄞˋ','冒':'ㄇㄠˋ','冠':'ㄍㄨㄢ','冰':'ㄅㄧㄥ','出':'ㄔㄨ','分':'ㄈㄣ','別':'ㄅㄧㄝˊ','到':'ㄉㄠˋ',
'前':'ㄑㄧㄢˊ','剛':'ㄍㄤ','力':'ㄌㄧˋ','功':'ㄍㄨㄥ','加':'ㄐㄧㄚ','動':'ㄉㄨㄥˋ','務':'ㄨˋ','包':'ㄅㄠ','卡':'ㄎㄚˇ','印':'ㄧㄣˋ','即':'ㄐㄧˊ',
'原':'ㄩㄢˊ','去':'ㄑㄩˋ','參':'ㄘㄢ','反':'ㄈㄢˇ','取':'ㄑㄩˇ','句':'ㄐㄩˋ','只':'ㄓˇ','召':'ㄓㄠˋ','可':'ㄎㄜˇ','右':'ㄧㄡˋ','吃':'ㄔ',
'合':'ㄏㄜˊ','名':'ㄇㄧㄥˊ','吧':'˙ㄅㄚ','呢':'˙ㄋㄜ','命':'ㄇㄧㄥˋ','和':'ㄏㄜˊ','咖':'ㄎㄚ','品':'ㄆㄧㄣˇ','哪':'ㄋㄚˇ','啡':'ㄈㄟ','喔':'ㄛ',
'喚':'ㄏㄨㄢˋ','喜':'ㄒㄧˇ','單':'ㄉㄢ','嗎':'˙ㄇㄚ','嘴':'ㄗㄨㄟˇ','器':'ㄑㄧˋ','噴':'ㄆㄣ','囉':'ㄌㄨㄛ','四':'ㄙˋ','回':'ㄏㄨㄟˊ','因':'ㄧㄣ',
'圍':'ㄨㄟˊ','圓':'ㄩㄢˊ','圖':'ㄊㄨˊ','在':'ㄗㄞˋ','地':'ㄉㄧˋ','堂':'ㄊㄤˊ','場':'ㄔㄤˇ','塗':'ㄊㄨˊ','填':'ㄊㄧㄢˊ','多':'ㄉㄨㄛ',
'大':'ㄉㄚˋ','太':'ㄊㄞˋ','失':'ㄕ','好':'ㄏㄠˇ','始':'ㄕˇ','子':'˙ㄗ','字':'ㄗˋ','存':'ㄘㄨㄣˊ','學':'ㄒㄩㄝˊ','它':'ㄊㄚ','完':'ㄨㄢˊ',
'定':'ㄉㄧㄥˋ','密':'ㄇㄧˋ','審':'ㄕㄣˇ','寫':'ㄒㄧㄝˇ','寶':'ㄅㄠˇ','射':'ㄕㄜˋ','專':'ㄓㄨㄢ','對':'ㄉㄨㄟˋ','導':'ㄉㄠˇ','小':'ㄒㄧㄠˇ',
'尖':'ㄐㄧㄢ','就':'ㄐㄧㄡˋ','尾':'ㄨㄟˇ','展':'ㄓㄢˇ','左':'ㄗㄨㄛˇ','己':'ㄐㄧˇ','已':'ㄧˇ','巴':'˙ㄅㄚ','巾':'ㄐㄧㄣ','布':'ㄅㄨˋ','師':'ㄕ',
'帳':'ㄓㄤˋ','帽':'ㄇㄠˋ','幫':'ㄅㄤ','年':'ㄋㄧㄢˊ','幾':'ㄐㄧˇ','度':'ㄉㄨˋ','建':'ㄐㄧㄢˋ','式':'ㄕˋ','引':'ㄧㄣˇ','張':'ㄓㄤ','彈':'ㄉㄢˋ',
'形':'ㄒㄧㄥˊ','彩':'ㄘㄞˇ','很':'ㄏㄣˇ','後':'ㄏㄡˋ','得':'˙ㄉㄜ','從':'ㄘㄨㄥˊ','徵':'ㄓㄥ','心':'ㄒㄧㄣ','忙':'ㄇㄤˊ','快':'ㄎㄨㄞˋ',
'性':'ㄒㄧㄥˋ','怪':'ㄍㄨㄞˋ','恐':'ㄎㄨㄥˇ','息':'ㄒㄧ','想':'ㄒㄧㄤˇ','愛':'ㄞˋ','感':'ㄍㄢˇ','憶':'ㄧˋ','成':'ㄔㄥˊ','我':'ㄨㄛˇ',
'或':'ㄏㄨㄛˋ','戴':'ㄉㄞˋ','所':'ㄙㄨㄛˇ','手':'ㄕㄡˇ','才':'ㄘㄞˊ','打':'ㄉㄚˇ','把':'ㄅㄚˇ','披':'ㄆㄧ','拉':'ㄌㄚ','拖':'ㄊㄨㄛ','指':'ㄓˇ',
'按':'ㄢˋ','捨':'ㄕㄜˇ','排':'ㄆㄞˊ','接':'ㄐㄧㄝ','控':'ㄎㄨㄥˋ','描':'ㄇㄧㄠˊ','換':'ㄏㄨㄢˋ','揭':'ㄐㄧㄝ','揮':'ㄏㄨㄟ','擇':'ㄗㄜˊ',
'擊':'ㄐㄧ','擦':'ㄘㄚ','放':'ㄈㄤˋ','故':'ㄍㄨˋ','敗':'ㄅㄞˋ','數':'ㄕㄨˋ','文':'ㄨㄣˊ','新':'ㄒㄧㄣ','方':'ㄈㄤ','施':'ㄕ','星':'ㄒㄧㄥ',
'是':'ㄕˋ','時':'ㄕˊ','暖':'ㄋㄨㄢˇ','曉':'ㄒㄧㄠˇ','更':'ㄍㄥˋ','書':'ㄕㄨ','最':'ㄗㄨㄟˋ','會':'ㄏㄨㄟˋ','有':'ㄧㄡˇ','本':'ㄅㄣˇ',
'朵':'ㄉㄨㄛˇ','東':'ㄉㄨㄥ','果':'ㄍㄨㄛˇ','核':'ㄏㄜˊ','案':'ㄢˋ','桶':'ㄊㄨㄥˇ','條':'ㄊㄧㄠˊ','棒':'ㄅㄤˋ','樂':'ㄌㄜˋ','標':'ㄅㄧㄠ',
'樣':'ㄧㄤˋ','橘':'ㄐㄩˊ','機':'ㄐㄧ','橡':'ㄒㄧㄤˋ','檔':'ㄉㄤˋ','次':'ㄘˋ','欣':'ㄒㄧㄣ','歡':'ㄏㄨㄢ','正':'ㄓㄥˋ','步':'ㄅㄨˋ','段':'ㄉㄨㄢˋ',
'每':'ㄇㄟˇ','比':'ㄅㄧˇ','毛':'ㄇㄠˊ','氣':'ㄑㄧˋ','水':'ㄕㄨㄟˇ','決':'ㄐㄩㄝˊ','沒':'ㄇㄟˊ','法':'ㄈㄚˇ','泳':'ㄩㄥˇ','淇':'ㄑㄧˊ',
'淋':'ㄌㄧㄣˊ','清':'ㄑㄧㄥ','游':'ㄧㄡˊ','準':'ㄓㄨㄣˇ','滑':'ㄏㄨㄚˊ','滾':'ㄍㄨㄣˇ','滿':'ㄇㄢˇ','漂':'ㄆㄧㄠˋ','火':'ㄏㄨㄛˇ','為':'ㄨㄟˋ',
'無':'ㄨˊ','照':'ㄓㄠˋ','熊':'ㄒㄩㄥˊ','片':'ㄆㄧㄢˋ','版':'ㄅㄢˇ','牙':'ㄧㄚˊ','牠':'ㄊㄚ','物':'ㄨˋ','特':'ㄊㄜˋ','狀':'ㄓㄨㄤˋ','狗':'ㄍㄡˇ',
'猜':'ㄘㄞ','玩':'ㄨㄢˊ','現':'ㄒㄧㄢˋ','生':'ㄕㄥ','用':'ㄩㄥˋ','由':'ㄧㄡˊ','畫':'ㄏㄨㄚˋ','當':'ㄉㄤ','登':'ㄉㄥ','發':'ㄈㄚ','的':'˙ㄉㄜ',
'皇':'ㄏㄨㄤˊ','皮':'ㄆㄧˊ','目':'ㄇㄨˋ','直':'ㄓˊ','看':'ㄎㄢˋ','眼':'ㄧㄢˇ','睛':'ㄐㄧㄥ','確':'ㄑㄩㄝˋ','示':'ㄕˋ','秀':'ㄒㄧㄡˋ',
'秘':'ㄇㄧˋ','程':'ㄔㄥˊ','種':'ㄓㄨㄥˇ','空':'ㄎㄨㄥ','窗':'ㄔㄨㄤ','第':'ㄉㄧˋ','答':'ㄉㄚˊ','算':'ㄙㄨㄢˋ','範':'ㄈㄢˋ','簡':'ㄐㄧㄢˇ',
'粉':'ㄈㄣˇ','粗':'ㄘㄨ','系':'ㄒㄧˋ','紅':'ㄏㄨㄥˊ','紋':'ㄨㄣˊ','級':'ㄐㄧˊ','素':'ㄙㄨˋ','紫':'ㄗˇ','細':'ㄒㄧˋ','結':'ㄐㄧㄝˊ','給':'ㄍㄟˇ',
'統':'ㄊㄨㄥˇ','經':'ㄐㄧㄥ','綠':'ㄌㄩˋ','線':'ㄒㄧㄢˋ','編':'ㄅㄧㄢ','緩':'ㄏㄨㄢˇ','練':'ㄌㄧㄢˋ','縮':'ㄙㄨㄛ','繪':'ㄏㄨㄟˋ','繼':'ㄐㄧˋ',
'續':'ㄒㄩˋ','美':'ㄇㄟˇ','翁':'ㄨㄥ','翅':'ㄔˋ','習':'ㄒㄧˊ','翻':'ㄈㄢ','老':'ㄌㄠˇ','考':'ㄎㄠˇ','耳':'ㄦˇ','背':'ㄅㄟ','能':'ㄋㄥˊ',
'膀':'ㄅㄤˇ','臉':'ㄌㄧㄢˇ','自':'ㄗˋ','色':'ㄙㄜˋ','茸':'ㄖㄨㄥˊ','著':'˙ㄓㄜ','薩':'ㄙㄚˋ','藍':'ㄌㄢˊ','號':'ㄏㄠˋ','虹':'ㄏㄨㄥˊ',
'蜂':'ㄈㄥ','蜜':'ㄇㄧˋ','蝴':'ㄏㄨˊ','蝶':'ㄉㄧㄝˊ','行':'ㄒㄧㄥˊ','術':'ㄕㄨˋ','衝':'ㄔㄨㄥ','表':'ㄅㄧㄠˇ','被':'ㄅㄟˋ','裝':'ㄓㄨㄤ',
'裡':'ㄌㄧˇ','製':'ㄓˋ','複':'ㄈㄨˋ','西':'ㄒㄧ','要':'ㄧㄠˋ','見':'ㄐㄧㄢˋ','親':'ㄑㄧㄣ','覽':'ㄌㄢˇ','角':'ㄐㄩㄝˊ','觸':'ㄔㄨˋ','計':'ㄐㄧˋ',
'訊':'ㄒㄩㄣˋ','記':'ㄐㄧˋ','設':'ㄕㄜˋ','試':'ㄕˋ','話':'ㄏㄨㄚˋ','認':'ㄖㄣˋ','說':'ㄕㄨㄛ','誰':'ㄕㄟˊ','課':'ㄎㄜˋ','調':'ㄉㄧㄠˋ',
'請':'ㄑㄧㄥˇ','證':'ㄓㄥˋ','識':'ㄕˊ','議':'ㄧˋ','讀':'ㄉㄨˊ','變':'ㄅㄧㄢˋ','讓':'ㄖㄤˋ','貓':'ㄇㄠ','負':'ㄈㄨˋ','責':'ㄗㄜˊ','貼':'ㄊㄧㄝ',
'賞':'ㄕㄤˇ','超':'ㄔㄠ','越':'ㄩㄝˋ','趣':'ㄑㄩˋ','跑':'ㄆㄠˇ','跟':'ㄍㄣ','跳':'ㄊㄧㄠˋ','身':'ㄕㄣ','較':'ㄐㄧㄠˋ','載':'ㄗㄞˋ','輕':'ㄑㄧㄥ',
'述':'ㄕㄨˋ','送':'ㄙㄨㄥˋ','這':'ㄓㄜˋ','連':'ㄌㄧㄢˊ','進':'ㄐㄧㄣˋ','過':'ㄍㄨㄛˋ','適':'ㄕˋ','選':'ㄒㄩㄢˇ','避':'ㄅㄧˋ','還':'ㄏㄞˊ',
'邊':'ㄅㄧㄢ','那':'ㄋㄚˋ','部':'ㄅㄨˋ','都':'ㄉㄡ','配':'ㄆㄟˋ','醒':'ㄒㄧㄥˇ','重':'ㄔㄨㄥˊ','量':'ㄌㄧㄤˋ','錯':'ㄘㄨㄛˋ','鍵':'ㄐㄧㄢˋ',
'鏡':'ㄐㄧㄥˋ','長':'ㄓㄤˇ','門':'ㄇㄣˊ','開':'ㄎㄞ','關':'ㄍㄨㄢ','階':'ㄐㄧㄝ','險':'ㄒㄧㄢˇ','隱':'ㄧㄣˇ','隻':'ㄓ','難':'ㄋㄢˊ','電':'ㄉㄧㄢˋ',
'靈':'ㄌㄧㄥˊ','面':'ㄇㄧㄢˋ','音':'ㄧㄣ','頁':'ㄧㄝˋ','預':'ㄩˋ','領':'ㄌㄧㄥˇ','頭':'ㄊㄡˊ','題':'ㄊㄧˊ','顏':'ㄧㄢˊ','顯':'ㄒㄧㄢˇ',
'風':'ㄈㄥ','飛':'ㄈㄟ','餅':'ㄅㄧㄥˇ','餵':'ㄨㄟˋ','首':'ㄕㄡˇ','馬':'ㄇㄚˇ','驗':'ㄧㄢˋ','體':'ㄊㄧˇ','高':'ㄍㄠ','鬆':'ㄙㄨㄥ','魔':'ㄇㄛˊ',
'魚':'ㄩˊ','鳥':'ㄋㄧㄠˇ','麼':'˙ㄇㄜ','黃':'ㄏㄨㄤˊ','黑':'ㄏㄟ','點':'ㄉㄧㄢˇ','鼠':'ㄕㄨˇ','龍':'ㄌㄨㄥˊ'
};
const ZY_WORDS={'音樂':['ㄧㄣ','ㄩㄝˋ'],'長尾巴':['ㄔㄤˊ','ㄨㄟˇ','˙ㄅㄚ']};
const ZY_KEYS=Object.keys(ZY_WORDS).sort((a,b)=>b.length-a.length);
const ZY_HAN=/[一-鿿]/;
const ZY_TONES=new Set(['ˊ','ˇ','ˋ','˙','ˉ']);
let zyOn=false;
// 拆出注音符號與聲調：輕聲˙在字典裡放最前、其餘 ˊˇˋ 放最後
function zySplit(z){ const a=[...z];
  if(a[0]==='˙') return {syms:a.slice(1), tone:'˙', light:true};
  const last=a[a.length-1];
  if(ZY_TONES.has(last)) return {syms:a.slice(0,-1), tone:last==='ˉ'?'':last, light:false};
  return {syms:a, tone:'', light:false}; }
// 台灣課本樣式：注音直排在漢字右側
function zyRuby(ch,zy){ const cell=document.createElement('span'); cell.className='zc'; cell.appendChild(document.createTextNode(ch));
  if(zy){ const s=zySplit(zy); const zb=document.createElement('span'); zb.className='zb'+(s.light?' light':'');
    for(const sym of s.syms){ const e=document.createElement('span'); e.className='zs'; e.textContent=sym; zb.appendChild(e); }
    if(s.tone){ const t=document.createElement('span'); t.className='zt'; t.textContent=s.tone; zb.appendChild(t); }
    cell.appendChild(zb); }
  return cell; }
function zyRejectAncestor(n){ let p=n.parentNode; while(p&&p.nodeType===1){ const tg=p.tagName;
  if(tg==='SCRIPT'||tg==='STYLE'||tg==='CANVAS'||tg==='TEXTAREA'||tg==='INPUT') return true;
  if(p.classList&&(p.classList.contains('zc')||p.classList.contains('steps'))) return true; // 頂部進度列不加注音（太小、且會撐破手機版）
  p=p.parentNode; } return false; }
function zyRubifyTextNode(node){ const t=node.nodeValue; if(!t||!ZY_HAN.test(t))return; const p=node.parentNode; if(!p)return;
  const frag=document.createDocumentFragment(); let i=0;
  while(i<t.length){ const ch=t[i];
    if(!ZY_HAN.test(ch)){ let j=i; while(j<t.length&&!ZY_HAN.test(t[j]))j++; frag.appendChild(document.createTextNode(t.slice(i,j))); i=j; continue; }
    let w=null; for(const k of ZY_KEYS){ if(t.startsWith(k,i)){ w=k; break; } }
    if(w){ const zs=ZY_WORDS[w]; for(let m=0;m<w.length;m++) frag.appendChild(zyRuby(w[m],zs[m])); i+=w.length; continue; }
    frag.appendChild(zyRuby(ch, ZHUYIN[ch]||'')); i++; }
  p.replaceChild(frag,node); }
function zyRubifyTree(root){
  if(root.nodeType===3){ if(!zyRejectAncestor(root)) zyRubifyTextNode(root); return; }
  if(root.nodeType!==1)return; const tg=root.tagName;
  if(tg==='RUBY'||tg==='RT'||tg==='SCRIPT'||tg==='STYLE'||tg==='CANVAS'||tg==='TEXTAREA'||tg==='INPUT')return;
  const nodes=[], w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
    return (n.nodeValue&&ZY_HAN.test(n.nodeValue)&&!zyRejectAncestor(n))?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT; }});
  let n; while(n=w.nextNode())nodes.push(n); nodes.forEach(zyRubifyTextNode); }
function enableZhuyin(){ if(zyOn)return; zyOn=true; document.body.classList.add('zy'); zyRubifyTree(document.body);
  new MutationObserver(muts=>{ for(const mu of muts){
    if(mu.type==='characterData') zyRubifyTree(mu.target);
    else mu.addedNodes.forEach(nd=>{ if(nd.nodeType===1||nd.nodeType===3) zyRubifyTree(nd); }); }
  }).observe(document.body,{childList:true,subtree:true,characterData:true}); }

/* 執行期補字典：AI 產生的故事文字會連同注音一起回傳，合併進來就能全覆蓋 */
function zyAddDict(map){ if(!map)return; for(var k in map){ if(k && map[k] && !ZHUYIN[k]) ZHUYIN[k]=map[k]; } }
/* 合併字典後，重新處理已經畫出來的內容 */
function zyRefresh(root){ if(!zyOn)return; zyRubifyTree(root||document.body); }
