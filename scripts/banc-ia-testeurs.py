"""Banc interne : demandes proches de celles des testeurs, un client simulé répond aux questions,
jusqu'à la génération ; le code est ensuite compilé avec le wasm de cadam (compile.mjs).
Même prompt, modèle et effort que la prod. Usage : python3 scripts/banc-ia-testeurs.py src/server/aiChat.ts <dossier sorties> [ids,séparés,par,virgules] [répétitions]"""
import json, os, re, subprocess, sys, time, concurrent.futures as cf
import anthropic

src = open(sys.argv[1], encoding="utf-8").read()
system = re.search(r"const PARAMETRIC_AGENT_PROMPT = `(.*?)`;\n", src, re.S).group(1).replace("\\`", "`")
desc = re.search(r"answer_user: tool\(\{\s*description:\s*'(.*?)',", open(os.path.join(os.path.dirname(sys.argv[1]), "../../shared/chatAi.ts")).read(), re.S).group(1)
OUT = sys.argv[2]
cle = [l.strip() for l in open(os.path.expanduser("~/.botfleet/porte-cle/api-keys.env")) if l.strip().startswith("sk-ant-usr-")][0]
client = anthropic.Anthropic(api_key=cle)
tools = [
    {"name": "build_parametric_model", "description": "Create or update the complete OpenSCAD CAD artifact for the user.",
     "input_schema": {"type": "object", "properties": {"title": {"type": "string"}, "version": {"type": "string"}, "code": {"type": "string"}}, "required": ["title", "code"]}},
    {"name": "answer_user", "description": desc,
     "input_schema": {"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]}},
]

# (id, inspiré de, premier message, ce que le client sait / veut — caché à l'IA)
SCENARIOS = [
    ("zflip5", "Haithem", "Creer coque samsung z flip 5 stl",
     "Tu es un client tunisien peu technique, tu écris court avec des fautes. Tu ne connais pas les cotes. Tu veux juste une coque simple qui protège. Tu acceptes la proposition par défaut."),
    ("iphone13", "Haithem", "coque iphon 13 avec trou pour camera",
     "Client peu technique, réponses très courtes (« ok », « oui normal »). Tu veux une coque fine."),
    ("golf7", "Khaled Lokti", "A highly detailed, watertight, 3D printable STL model of a Volkswagen Golf 7 front bumper fog light grille cover (right side). Honeycomb mesh, chrome-style horizontal strip, mounting clips on the back for OEM-like fitment.",
     "Client mécanicien, tu as la pièce cassée en main. Si on te demande des cotes : environ 165 mm de large, 70 mm de haut, 12 mm d'épaisseur, 3 clips à l'arrière. Tu réponds en anglais, court."),
    ("w204", "Khaled Lokti", "grille d'aération capot mercedes classe C W204 côté gauche, nid d'abeille avec 3 ailettes, clips d'origine",
     "Client qui ne connaît pas les cotes et n'a pas la pièce sous la main. Tu dis « je sais pas, prends les cotes d'origine ». Si on te propose une version simplifiée ou approximative tu acceptes."),
    ("jett", "Khaled Kaddeche", "make me a funko pop of jett from valorant, 3 colors max and easy to print",
     "Joueur de Valorant, tu veux une figurine pour ton bureau. Si on te propose une version simplifiée tu acceptes. Taille : environ 10 cm si on demande. Réponses courtes en anglais."),
    ("train", "Saber", "train épicycloïdal",
     "Étudiant en mécanique. Tu veux un train épicycloïdal imprimable et fonctionnel : rapport 4:1 si on demande, couronne d'environ 80 mm, 3 satellites, AVEC porte-satellite et axes, couronne fermée d'un côté. Réponses courtes en français."),
    ("porteclé", "client type", "n7eb porte clé bel esm Ahmed",
     "Client tunisien qui écrit en darija latin. Tu veux un porte-clé avec le prénom Ahmed. Taille normale. Tu acceptes les propositions."),
    ("casque", "contrôle", "support casque audio à fixer sous le bureau, plateau de 25 mm d'épaisseur, crochet de 40 mm de large",
     "Client précis. Tout est déjà dans ta demande ; si on te demande autre chose tu dis « comme tu veux »."),
]

SCENARIOS += [
    ("reyna", "Khaled Kaddeche", "generate for me an stl model of a funko pop of reyna from the valorant game make it 4 colors tops and easy to print",
     "Joueur de Valorant. Tu acceptes une version simplifiée. Réponses courtes en anglais."),
    ("chat", "client type", "fais moi une figurine de mon chat roux couché, pour mettre sur une étagère",
     "Cliente non technique. Tu acceptes une version simplifiée, environ 8 cm."),
]
# Filtre optionnel : ids séparés par des virgules, puis nombre de répétitions.
if len(sys.argv) > 3:
    ids = sys.argv[3].split(",")
    SCENARIOS = [(f"{s[0]}-{k}",) + s[1:] for s in SCENARIOS if s[0] in ids for k in range(int(sys.argv[4]) if len(sys.argv) > 4 else 1)]
else:
    SCENARIOS = SCENARIOS[:8]

def simuler_client(persona, premier, historique, question):
    r = client.messages.create(model="claude-haiku-5-5", max_tokens=2000, system=persona + " Tu joues le client d'un site d'impression 3D qui parle à une IA de conception. Réponds UNIQUEMENT par ton message de client, une ou deux phrases max.",
        messages=[{"role": "user", "content": f"Ta demande initiale : {premier}\nÉchanges précédents : {historique or 'aucun'}\nL'IA te demande maintenant : {question}\nTa réponse :"}])
    return " ".join(b.text for b in r.content if b.type == "text").strip()

def lancer(sc):
    sid, inspire, premier, persona = sc
    msgs = [{"role": "user", "content": [{"type": "text", "text": premier}]}]
    journal, questions, t0 = [], [], time.time()
    for tour in range(5):
        with client.messages.stream(model="claude-sonnet-5-5", max_tokens=32000, system=system, tools=tools,
                                    tool_choice={"type": "auto"}, output_config={"effort": "low"}, messages=msgs) as f:
            r = f.get_final_message()
        outils = [b for b in r.content if b.type == "tool_use"]
        build = next((b for b in outils if b.name == "build_parametric_model"), None)
        if build:
            open(f"{OUT}/{sid}.scad", "w").write(build.input["code"])
            texte = " ".join(b.text for b in r.content if b.type == "text").strip()
            c = json.loads(subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "compile-scad.mjs"), f"{OUT}/{sid}.scad", f"{OUT}/{sid}.stl"], capture_output=True, text=True, timeout=600).stdout.strip().splitlines()[-1])
            return dict(id=sid, inspire=inspire, premier=premier, questions=questions, journal=journal, titre=build.input.get("title"), texte=texte[:400], compile=c, tours=tour + 1, s=round(time.time() - t0))
        q = next((b for b in outils if b.name == "answer_user"), None)
        if not q:
            return dict(id=sid, inspire=inspire, premier=premier, questions=questions, journal=journal, fin="texte libre: " + " ".join(b.text for b in r.content if b.type == "text")[:300])
        questions.append(q.input["message"])
        rep = simuler_client(persona, premier, " | ".join(journal), q.input["message"])
        journal.append(f"IA: {q.input['message']} → client: {rep}")
        msgs.append({"role": "assistant", "content": [{"type": "tool_use", "id": q.id, "name": "answer_user", "input": q.input}]})
        msgs.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": q.id, "content": "ok"}, {"type": "text", "text": rep}]})
    return dict(id=sid, inspire=inspire, premier=premier, questions=questions, journal=journal, fin="pas de génération après 5 tours")

with cf.ThreadPoolExecutor(4) as ex:
    def sur(s):
        try: return lancer(s)
        except Exception as e: return dict(id=s[0], inspire=s[1], premier=s[2], questions=[], journal=[], fin=f"erreur {e!r}"[:300])
    res = list(ex.map(sur, SCENARIOS))
json.dump(res, open(f"{OUT}/resultats.json", "w"), ensure_ascii=False, indent=1)
for r in res:
    print(f"\n### {r['id']} ({r['inspire']}) — {len(r['questions'])} question(s)")
    for j in r["journal"]: print("  ", j[:400])
    print("   →", r.get("titre") or r.get("fin"), "|", r.get("compile"))
