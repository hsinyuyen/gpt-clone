import React, { useEffect, useState } from "react";

interface NumberFieldProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
}

/**
 * 可以真的清空的數字輸入框。
 *
 * 各頁原本直接寫 `parseInt(e.target.value) || 1`／`Math.max(1, ...)`，
 * 結果是框裡永遠留著一個數字刪不掉——要改成別的值得先在後面補打、再回頭刪掉舊的那位數。
 *
 * 這裡把「正在輸入的字串」和「送出去的數值」分開：
 *  - 打字時只更新字串（允許空字串），解析得出數字才往上送，且只夾上限
 *  - 失焦時才夾回 min/max 並把顯示補正回合法值
 */
const NumberField: React.FC<NumberFieldProps> = ({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step,
  className,
  style,
  placeholder,
  title,
  disabled,
}) => {
  const [text, setText] = useState<string>(String(value));

  // 外部改值（例如按快捷金額鈕）時同步顯示；正在輸入且等值時不覆蓋，避免游標跳動
  useEffect(() => {
    const parsed = parseInt(text, 10);
    if (Number.isNaN(parsed) || parsed !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      value={text}
      step={step}
      min={min}
      max={max}
      title={title}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      onChange={(e) => {
        const t = e.target.value;
        setText(t); // 允許暫時空白，第一個數字才刪得掉
        if (t === "") return;
        const n = parseInt(t, 10);
        if (!Number.isNaN(n)) onChange(Math.min(max, n));
      }}
      onBlur={() => {
        const n = parseInt(text, 10);
        const v = Number.isNaN(n) ? min : Math.min(max, Math.max(min, n));
        setText(String(v));
        if (v !== value) onChange(v);
      }}
      className={className}
    />
  );
};

export default NumberField;
