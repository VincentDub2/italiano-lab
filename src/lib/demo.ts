import type { Card } from './study';
const rows = [
['Come va?','Comment ça va ?','Ciao Luca, come va?','Salut Luca, comment ça va ?','Quotidien'],
['Vorrei un caffè','Je voudrais un café','Buongiorno, vorrei un caffè.','Bonjour, je voudrais un café.','Quotidien'],
['Quanto costa?','Combien ça coûte ?','Quanto costa questo biglietto?','Combien coûte ce billet ?','Quotidien'],
['Dov’è la fermata?','Où est l’arrêt ?','Scusi, dov’è la fermata del tram?','Excusez-moi, où est l’arrêt du tram ?','Quotidien'],
['Posso pagare con la carta?','Je peux payer par carte ?','Posso pagare con la carta, per favore?','Je peux payer par carte, s’il vous plaît ?','Quotidien'],
['Ci vediamo dopo','À tout à l’heure','Devo andare, ci vediamo dopo!','Je dois partir, à tout à l’heure !','Quotidien'],
['Ho una riunione','J’ai une réunion','Ho una riunione alle dieci.','J’ai une réunion à dix heures.','Travail'],
['Ti mando una mail','Je t’envoie un mail','Ti mando una mail con i dettagli.','Je t’envoie un mail avec les détails.','Travail'],
['Sono d’accordo','Je suis d’accord','Sono d’accordo con la tua proposta.','Je suis d’accord avec ta proposition.','Travail'],
['Hai un momento?','Tu as un moment ?','Hai un momento per parlarne?','Tu as un moment pour en parler ?','Travail'],
['Qual è la scadenza?','Quelle est la date limite ?','Qual è la scadenza del progetto?','Quelle est la date limite du projet ?','Travail'],
['Lavoro da casa','Je travaille de chez moi','Oggi lavoro da casa.','Aujourd’hui je travaille de chez moi.','Travail'],
['Ho un appuntamento','J’ai un rendez-vous','Ho un appuntamento alle tre.','J’ai un rendez-vous à trois heures.','Rendez-vous'],
['A che ora?','À quelle heure ?','A che ora ci incontriamo?','À quelle heure nous rencontrons-nous ?','Rendez-vous'],
['Sono in ritardo','Je suis en retard','Scusa, sono in ritardo di dieci minuti.','Pardon, j’ai dix minutes de retard.','Rendez-vous'],
['Possiamo rimandare?','Peut-on reporter ?','Possiamo rimandare a domani?','Peut-on reporter à demain ?','Rendez-vous'],
['Ci vediamo lì','On se retrouve là-bas','Ci vediamo lì davanti alla stazione.','On se retrouve là-bas devant la gare.','Rendez-vous'],
['Va bene per te?','Ça te convient ?','Martedì alle sei va bene per te?','Mardi à six heures, ça te convient ?','Rendez-vous'],
];
export const demo: Card[] = rows.map(([italian,french,example,translation,theme], i) => ({ id: `demo-${i+1}`, italian,french,example,translation,theme,source:'Cours de démonstration' }));
