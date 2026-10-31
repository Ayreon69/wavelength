// Les règles, lisibles en deux minutes et consultables à tout moment.
import { Check, Eye, Hand, MessageSquareQuote, MoveHorizontal, Users } from 'lucide-react';
import { COOP_CARDS, WIN_SCORE } from '../../../shared/protocol';
import { useStore } from '../store';
import { Dial, SpectrumCard } from './Dial';
import { Modal } from './Ui';

const EXAMPLE = { left: 'Froid', right: 'Chaud' };

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <section className="rule-hero">
          <div className="rule-dial">
            <Dial value={38} target={36} open size="sm" spectrum={EXAMPLE} hit />
            <SpectrumCard spectrum={EXAMPLE} size="sm" />
            <p className="rule-clue">« Un café oublié sur le bureau »</p>
          </div>
          <p>
            Un seul joueur, <b>le médium</b>, voit où se cache la cible sur le cadran. Il donne <b>un indice</b>, et son équipe débat pour tourner l'aiguille au bon endroit. <b>Plus elle tombe près du centre de la cible, plus elle marque.</b>
          </p>
        </section>

        <section>
          <h3>Une manche</h3>
          <ol className="rule-steps">
            <li>
              <Eye size={20} aria-hidden />
              <div>
                <b>Le médium choisit une carte</b> parmi deux : deux idées opposées, une à chaque bout du cadran. Puis il découvre la cible, cachée au hasard.
              </div>
            </li>
            <li>
              <MessageSquareQuote size={20} aria-hidden />
              <div>
                <b>Il donne un indice</b> : quelque chose qui, entre ces deux idées, tombe pile à cet endroit. Ensuite, il se tait et garde un visage de marbre.
              </div>
            </li>
            <li>
              <Hand size={20} aria-hidden />
              <div>
                <b>Son équipe règle l'aiguille.</b> Chacun peut la tourner. Quand tout le monde a validé la même position, elle se verrouille.
              </div>
            </li>
            <li>
              <MoveHorizontal size={20} aria-hidden />
              <div>
                <b>En équipes, l'autre camp parie</b> : le centre de la cible est-il <b>à gauche</b> ou <b>à droite</b> de l'aiguille ? Là aussi, il faut se mettre d'accord.
              </div>
            </li>
            <li>
              <Check size={20} aria-hidden />
              <div>
                <b>On dévoile</b> la cible, on compte les points, et la main passe.
              </div>
            </li>
          </ol>
        </section>

        <section className="rule-split">
          <div className="rule-case">
            <h3>Le score</h3>
            <ul className="rule-bands">
              <li>
                <span className="band-chip is-4">4</span> en plein centre
              </li>
              <li>
                <span className="band-chip is-3">3</span> juste à côté
              </li>
              <li>
                <span className="band-chip is-2">2</span> sur le bord
              </li>
            </ul>
            <p>Le pari juste rapporte 1 point à l'autre équipe, sauf si l'aiguille est en plein centre.</p>
          </div>
          <div className="rule-case">
            <h3>
              <Users size={18} aria-hidden /> En équipes
            </h3>
            <p>
              L'équipe qui joue en second part avec 1 point. La première à <b>{WIN_SCORE} points</b> gagne. <b>Rattrapage :</b> une équipe qui fait mouche et reste derrière rejoue aussitôt. <b>Égalité</b> au-delà de {WIN_SCORE} : chaque équipe rejoue une manche, et la meilleure l'emporte.
            </p>
          </div>
        </section>

        <section className="rule-case">
          <h3>Tous ensemble (coopératif)</h3>
          <p>
            Dès 2 joueurs. Toute la table devine, chacun devient médium à son tour, sans pari. La partie dure <b>{COOP_CARDS} cartes</b>. Le plein centre vaut 3 points, mais <b>ajoute une carte</b>. À la fin, votre score vous dit si vous êtes sur la même longueur d'onde.
          </p>
        </section>

        <section className="rule-memory">
          <h3>Un bon indice</h3>
          <ul className="rule-list">
            <li>
              <b>Une seule idée</b>, pas deux collées ensemble.
            </li>
            <li>
              <b>Quelque chose qui existe</b> déjà : une chose, une personne, une œuvre, même fictive.
            </li>
            <li>
              <b>En rapport avec la carte</b>, sans reprendre ses mots ni leurs synonymes.
            </li>
            <li>
              <b>Pas de chiffres</b> pour désigner une position.
            </li>
          </ul>
        </section>

        <p className="rule-foot">
          D'après <i>Wavelength</i>, le jeu de Wolfgang Warsch, Alex Hague et Justin Vickers. Création de fans, non officielle, avec ses propres visuels et ses propres cartes.
        </p>
      </div>
    </Modal>
  );
}
