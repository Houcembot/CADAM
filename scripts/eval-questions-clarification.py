"""Essai réel : le nouveau prompt paramétrique pose-t-il les bonnes questions ?
Même modèle et même effort que la prod (claude-sonnet-5-5, effort low, outils auto).
Usage : python3 eval_questions.py <chemin aiChat.ts> [ancien|nouveau]
"""
import os
import re
import sys
import anthropic

src = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r"const PARAMETRIC_AGENT_PROMPT = `(.*?)`;\n", src, re.S)
system = m.group(1).replace("\\`", "`")
assert "${" not in system, "le prompt contient une interpolation"

# La clé « claude voxel3ds » est seule sur sa ligne (sans NOM=) : on la repère par son préfixe.
cles = [l.strip() for l in open(os.path.expanduser("~/.botfleet/porte-cle/api-keys.env")) if l.strip().startswith("sk-ant-usr-")]
assert len(cles) == 1, f"{len(cles)} clés sk-ant-usr trouvées (attendu : 1)"
cle = cles[0]
client = anthropic.Anthropic(api_key=cle)

tools = [
    {
        "name": "build_parametric_model",
        "description": "Create or update the complete OpenSCAD CAD artifact for the user.",
        "input_schema": {"type": "object", "properties": {"title": {"type": "string"}, "version": {"type": "string"}, "code": {"type": "string"}}, "required": ["title", "code"]},
    },
    {
        "name": "answer_user",
        "description": re.search(r"answer_user: tool\(\{\s*description:\s*'(.*?)',", open(os.path.join(os.path.dirname(sys.argv[1]), "../../shared/chatAi.ts")).read(), re.S).group(1),
        "input_schema": {"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]},
    },
]

MERCEDES = ("A highly detailed, watertight, 3D printable STL model of a Mercedes-Benz SLK R171 hood vent intake grille (left side panel). "
            "It must feature a clean honeycomb mesh texture and 3 aerodynamic vertical fins running across the surface. "
            "Include accurate mounting clips on the back side for OEM-like fitment. Perfect geometry for automotive replacement part 3D printing.")
Q = lambda t: [{"type": "tool_use", "id": f"q{abs(hash(t)) % 10**6}", "name": "answer_user", "input": {"message": t}}]
R = lambda tid: [{"type": "tool_result", "tool_use_id": tid, "content": "ok"}]

def conv(*tours):
    """tours : ('u', texte) ou ('q', question de l'assistant) -> messages API."""
    msgs = []
    for role, t in tours:
        if role == "u":
            if msgs and msgs[-1]["role"] == "user":
                msgs[-1]["content"].append({"type": "text", "text": t})
            else:
                msgs.append({"role": "user", "content": [{"type": "text", "text": t}]})
        else:
            bloc = Q(t)
            msgs.append({"role": "assistant", "content": bloc})
            msgs.append({"role": "user", "content": R(bloc[0]["id"])})
    return msgs

SCENARIOS = [
    ("Haithem : Z Flip 4 sans cotes", "question", conv(("u", "Creer covre samsung z flip 4 stl"))),
    ("khaled lokti : grille Mercedes sans cotes", "question", conv(("u", MERCEDES))),
    ("Khaled K. : Funko Reyna", "question", conv(("u", "generate for me an stl model of a funko pop of reyna from the valorant game make it 4 colors tops and easy to print"))),
    ("Demande complète avec cotes", "build", conv(("u", "Un support de téléphone pour bureau, 80 mm de large, 110 mm de haut, incliné à 60°, épaisseur 4 mm"))),
    ("« ok » après une question", "build", conv(("u", "Creer covre samsung z flip 4 stl"),
        ("q", "Je pars sur les cotes officielles du Z Flip 4 fermé (71,9 × 84,9 × 17,1 mm) avec 0,3 mm de jeu, ça vous va ?"), ("u", "ok"))),
    ("3 questions déjà posées", "build", conv(("u", "je veux une boite"),
        ("q", "Quelles dimensions intérieures (L × l × h) ? Sinon je pars sur 100 × 60 × 40 mm."), ("u", "je sais pas"),
        ("q", "Avec un couvercle ? Sinon je fais une boîte ouverte."), ("u", "peut-être"),
        ("q", "Pour ranger quoi ? Sinon je pars sur une boîte de rangement générique."), ("u", "des trucs"))),
]

ok = 0
for nom, attendu, msgs in SCENARIOS:
    r = client.messages.create(
        model="claude-sonnet-5-5", max_tokens=32000, system=system, tools=tools,
        tool_choice={"type": "auto"}, output_config={"effort": "low"}, messages=msgs,
    )
    outils = [b for b in r.content if b.type == "tool_use"]
    texte = " ".join(b.text for b in r.content if b.type == "text")
    obtenu = "build" if any(b.name == "build_parametric_model" for b in outils) else "question" if any(b.name == "answer_user" for b in outils) else "texte libre"
    msg = next((b.input.get("message", "") for b in outils if b.name == "answer_user"), texte)
    bon = obtenu == attendu
    ok += bon
    print(f"\n{'✅' if bon else '❌'} {nom} — attendu {attendu}, obtenu {obtenu}")
    if obtenu != "build":
        print("   «", msg.strip().replace("\n", " ")[:500], "»", f"[{msg.count('?')} « ? »]")
    else:
        print("   titre :", next(b.input.get("title") for b in outils if b.name == "build_parametric_model"), "|", texte.strip()[:200])
print(f"\n{ok}/{len(SCENARIOS)} conformes")
