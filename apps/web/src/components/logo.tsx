import Image from "next/image";
import black from "../../logo-black-transparent.png";
import white from "../../logo-white-transparent.png";

export function LogoMark() {
  return (
    <span className="sahaay-logo" aria-hidden="true">
      <Image src={black} alt="" className="logo-light" sizes="80px" />
      <Image src={white} alt="" className="logo-dark" sizes="80px" />
    </span>
  );
}
export function Logo() {
  return (
    <span className="sahaay-wordmark">
      <LogoMark />
      <span>Sahaay</span>
    </span>
  );
}
