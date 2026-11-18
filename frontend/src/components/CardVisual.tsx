import type { CardStatus, CardType } from '../api/types';
import { CARD_TYPE_LABEL } from '../api/types';

/** Visual representation of a virtual card (View only). */
export default function CardVisual({ nickname, number, expiry, holder, type, status }: {
  nickname: string; number: string; expiry: string; holder: string; type: CardType; status: CardStatus;
}) {
  const groups = number.replace(/\s/g, '').match(/.{1,4}/g) ?? [number];
  return (
    <div className={`vcard vcard-${type.toLowerCase()} ${status !== 'ACTIVE' ? 'vcard-off' : ''}`}>
      <div className="vcard-top">
        <span className="vcard-nick">{nickname}</span>
        <span className="vcard-type">{CARD_TYPE_LABEL[type]}</span>
      </div>
      <div className="vcard-chip" />
      <div className="vcard-number">{groups.join(' ')}</div>
      <div className="vcard-bottom">
        <div><div className="vcard-cap">Card holder</div><div>{holder}</div></div>
        <div><div className="vcard-cap">Expires</div><div>{expiry}</div></div>
      </div>
      {status !== 'ACTIVE' && <div className="vcard-stamp">{status}</div>}
    </div>
  );
}
