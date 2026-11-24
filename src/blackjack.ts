import { Text } from './app.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS = ['S', 'H', 'D', 'C'];
const CARD_W = 44, CARD_H = 62, PANEL = { x: 120, y: 90, w: 400, h: 250 };
/** Value of a hand: aces count 11 while that does not bust. */
export function handValue(h: number[]): number {
  let t = 0, aces = 0; for (const c of h) { const r = c % 13; if (r === 0) { aces++; t += 11; } else t += Math.min(10, r + 1); }
  while (t > 21 && aces-- > 0) t -= 10; return t;
}
/**
 * Black Jack of the Tower of Ordeal top floors (script sentences 73 = play one hand, 74 = read the result). PLACEHOLDER rules: the exe's table game is not decoded
 * (only the script side is: result 0 = draw, 1 = player wins, 2 = dealer wins, wins in a row are counted by the script). Standard rules, a single 52-card deck per hand,
 * dealer stands on 17, natural 21 beats a made 21, ties push.
 */
export class Blackjack {
  player: number[] = []; dealer: number[] = []; private deck: number[] = []; phase: 'play' | 'done' = 'play'; result = 0; note = '';
  constructor(public bet: number, private rnd: () => number = Math.random) {
    this.deck = Array.from({ length: 52 }, (_, i) => i); for (let i = 51; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]; }
    this.player = [this.deck.pop()!, this.deck.pop()!]; this.dealer = [this.deck.pop()!, this.deck.pop()!];
    if (handValue(this.player) === 21 || handValue(this.dealer) === 21) this.finish();
  }
  hit() { if (this.phase !== 'play') return; this.player.push(this.deck.pop()!); if (handValue(this.player) >= 21) this.stand(); }
  stand() { if (this.phase !== 'play') return; while (handValue(this.dealer) < 17) this.dealer.push(this.deck.pop()!); this.finish(); }
  private finish() {
    const p = handValue(this.player), d = handValue(this.dealer), pn = this.player.length === 2 && p === 21, dn = this.dealer.length === 2 && d === 21;
    this.result = p > 21 ? 2 : d > 21 ? 1 : pn !== dn ? (pn ? 1 : 2) : p > d ? 1 : p < d ? 2 : 0;
    this.note = this.result === 1 ? 'You win!' : this.result === 2 ? (p > 21 ? 'Bust. You lose.' : 'You lose.') : 'Draw.'; this.phase = 'done';
  }
  private static btn(i: number) { return { x: PANEL.x + 60 + i * 150, y: PANEL.y + PANEL.h - 36, w: 120, h: 24 }; }
  /** Click: Hit / Stand while playing, anywhere once the hand is over. Returns true when the hand is finished and acknowledged. */
  click(x: number, y: number): boolean {
    if (this.phase === 'done') return true;
    const [h, s] = [Blackjack.btn(0), Blackjack.btn(1)], inB = (b: { x: number; y: number; w: number; h: number }) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
    if (inB(h)) this.hit(); else if (inB(s)) this.stand(); return false;
  }
  key(k: string): boolean { if (this.phase === 'done') return k === 'enter' || k === ' '; if (k === 'h') this.hit(); else if (k === 's') this.stand(); return false; }
  private card(ctx: CanvasRenderingContext2D, text: Text, c: number | null, x: number, y: number) {
    ctx.fillStyle = c === null ? '#7a2030' : '#f4ecd0'; ctx.fillRect(x, y, CARD_W, CARD_H); ctx.strokeStyle = '#201810'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, CARD_W - 1, CARD_H - 1);
    if (c === null) { ctx.strokeStyle = '#d8b878'; ctx.strokeRect(x + 5.5, y + 5.5, CARD_W - 11, CARD_H - 11); return; }
    text.draw(ctx, RANKS[c % 13], x + 4, y + 4); text.draw(ctx, SUITS[Math.floor(c / 13)], x + 4, y + 18);
  }
  draw(ctx: CanvasRenderingContext2D, text: Text) {
    const P = PANEL; ctx.fillStyle = 'rgba(8,24,16,0.94)'; ctx.fillRect(P.x, P.y, P.w, P.h); ctx.strokeStyle = '#a89868'; ctx.lineWidth = 2; ctx.strokeRect(P.x + 1, P.y + 1, P.w - 2, P.h - 2);
    text.drawCenter(ctx, `Black Jack   Bet ${this.bet} GOLD`, P.x + P.w / 2, P.y + 10);
    const hide = this.phase === 'play';
    text.draw(ctx, `Dealer${hide ? '' : ' ' + handValue(this.dealer)}`, P.x + 16, P.y + 30);
    this.dealer.forEach((c, i) => this.card(ctx, text, hide && i === 1 ? null : c, P.x + 16 + i * (CARD_W + 6), P.y + 44));
    text.draw(ctx, `You ${handValue(this.player)}`, P.x + 16, P.y + 112);
    this.player.forEach((c, i) => this.card(ctx, text, c, P.x + 16 + i * (CARD_W + 6), P.y + 126));
    if (this.phase === 'play') for (const [i, l] of ['Hit (H)', 'Stand (S)'].entries()) { const b = Blackjack.btn(i); ctx.strokeStyle = '#a89868'; ctx.strokeRect(b.x + .5, b.y + .5, b.w, b.h); text.drawCenter(ctx, l, b.x + b.w / 2 + .5, b.y + 6); }
    else { text.drawCenter(ctx, this.note, P.x + P.w / 2, P.y + P.h - 58); text.drawCenter(ctx, 'Click to continue', P.x + P.w / 2, P.y + P.h - 34); }
  }
}
