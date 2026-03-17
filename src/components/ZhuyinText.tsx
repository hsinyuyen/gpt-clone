import { useZhuyin } from "@/contexts/ZhuyinContext";
import { addZhuyinAnnotations } from "@/utils/zhuyin";

interface ZhuyinTextProps {
  children: string;
}

const ZhuyinText = ({ children }: ZhuyinTextProps) => {
  const { zhuyinMode } = useZhuyin();

  if (!zhuyinMode) {
    return <>{children}</>;
  }

  return (
    <span
      dangerouslySetInnerHTML={{
        __html: addZhuyinAnnotations(children),
      }}
    />
  );
};

export default ZhuyinText;
