// Les mots de la table : noms, équipes, et ce que chaque bande de la cible veut dire.
import { TEAM_NAME, type RoomView, type Zone } from '../../../shared/protocol';

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

/** Le nom, avec une majuscule si on commence la phrase par « toi ». */
export function NameOf(view: RoomView, id: string | undefined | null): string {
  const n = nameOf(view, id);
  return n === 'toi' ? 'Toi' : n;
}

export function teamName(t: 'A' | 'B' | null | undefined): string {
  return t ? TEAM_NAME[t] : '';
}

/** Le verdict d'une manche, comme une annonce à la radio. */
export const ZONE_TITLE: Record<Zone, string> = {
  4: 'Dans le mille !',
  3: 'Tout près !',
  2: 'Pas loin',
  0: 'À côté…',
};

export function pointsLabel(n: number): string {
  return n === 0 ? '0 point' : n === 1 ? '+1 point' : `+${n} points`;
}

/** L'appréciation d'une partie coopérative, sur l'échelle du livret, avec nos mots. */
export function coopRating(score: number): { title: string; text: string } {
  if (score >= 25) return { title: 'Fusion mentale', text: 'Vous ne jouez plus ensemble : vous pensez ensemble. C’en est presque inquiétant.' };
  if (score >= 22) return { title: 'Télépathes', text: 'Un mot suffit, parfois même un regard. Le signal passe sans grésiller.' };
  if (score >= 19) return { title: 'Même longueur d’onde', text: 'Vous captez la même station, et vous chantez par-dessus.' };
  if (score >= 16) return { title: 'Bien reçu !', text: 'Une vraie victoire : le message passe, et la table applaudit.' };
  if (score >= 13) return { title: 'Presque en phase', text: 'Encore un petit tour de molette et c’était parfait.' };
  if (score >= 10) return { title: 'Ça capte, par moments', text: 'Pas mal ! Pas génial, mais pas mal. Le réglage fin viendra.' };
  if (score >= 7) return { title: 'Grésillements', text: 'On devine la chanson, pas encore les paroles.' };
  if (score >= 4) return { title: 'Friture sur la ligne', text: 'Essayez d’éteindre et de rallumer vos cerveaux.' };
  return { title: 'Pas de réseau', text: 'Le signal n’est jamais passé. Vérifiez les branchements… et rejouez !' };
}
