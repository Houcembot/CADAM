"""Auto-contrôle : l'IA reçoit le rendu de sa pièce (comme en prod) ; corrige-t-elle une pièce cassée, et laisse-t-elle une bonne pièce ?
Usage : python autocontrole.py <aiChat.ts> <ChatSession.tsx> <dossier banc> <répétitions>"""
import base64, json, os, re, subprocess, sys
import anthropic
src = open(sys.argv[1], encoding="utf-8").read()
system = re.search(r"const PARAMETRIC_AGENT_PROMPT = `(.*?)`;\n", src, re.S).group(1).replace("\\`", "`")
msg_ok = re.search(r"'(Compilation successful\.[^']*)'", open(sys.argv[2]).read()).group(1)
B, REP = sys.argv[3], int(sys.argv[4])
cle = [l.strip() for l in open(os.path.expanduser("~/.botfleet/porte-cle/api-keys.env")) if l.strip().startswith("sk-ant-usr-")][0]
client = anthropic.Anthropic(api_key=cle)
tools = [{"name": "build_parametric_model", "description": "Create or update the complete OpenSCAD CAD artifact for the user.",
          "input_schema": {"type": "object", "properties": {"title": {"type": "string"}, "code": {"type": "string"}}, "required": ["title", "code"]}},
         {"name": "answer_user", "description": "Reply without building a model.", "input_schema": {"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]}}]
CAS = [  # (nom, demande, scad, rendu, attendu)
    ("jett cassée (prod)", "make me a funko pop of jett from valorant, 3 colors max and easy to print", f"{B}/../prod/prod.scad", f"{B}/jett-cassee.png", "corrige"),
    ("jett correcte", "make me a funko pop of jett from valorant, 3 colors max and easy to print", f"{B}/sorties4/jett-0.scad", f"{B}/rendu-jett-0.png", "garde"),
    ("porte-clé", "n7eb porte clé bel esm Ahmed", f"{B}/sorties5/porteclé.scad", f"{B}/rendu-porteclé.png", "garde"),
    ("coque iphone", "coque iphon 13 avec trou pour camera", f"{B}/sorties5/iphone13.scad", f"{B}/rendu-iphone13.png", "garde"),
    ("train à plat", "train épicycloïdal, couronne 80 mm, 3 satellites, porte-satellite, couronne fermée d'un côté", f"{B}/sorties5/train.scad", f"{B}/rendu-train.png", "garde"),
]
ok = 0; total = 0; stats = []
FILTRE = sys.argv[5] if len(sys.argv) > 5 else ""
for nom, demande, scad, png, attendu in [c for c in CAS if FILTRE in c[0]]:
    img = base64.b64encode(open(png, "rb").read()).decode()
    msgs = [{"role": "user", "content": demande},
            {"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_build1", "name": "build_parametric_model", "input": {"title": nom, "code": open(scad).read()}}]},
            {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_build1", "content": [{"type": "text", "text": msg_ok}, {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img}}]}]}]
    for k in range(REP):
        with client.messages.stream(model="claude-sonnet-5-5", max_tokens=32000, system=system, tools=tools, tool_choice={"type": "auto"}, output_config={"effort": "low"}, messages=msgs) as f:
            r = f.get_final_message()
        build = next((b for b in r.content if b.type == "tool_use" and b.name == "build_parametric_model"), None)
        texte = " ".join(b.text for b in r.content if b.type == "text").strip().replace("\n", " ")
        obtenu = "corrige" if build else "garde"
        extra = ""
        if build:
            out = f"{B}/autoc-{nom.split()[0]}-{k}"
            open(out + ".scad", "w").write(build.input["code"])
            c = json.loads(subprocess.run(["node", f"{os.path.dirname(os.path.abspath(__file__))}/compile-scad.mjs", out + ".scad", out + ".stl"], capture_output=True, text=True).stdout.strip().splitlines()[-1])
            extra = f" | recompile rc={c['rc']} triangles={c.get('triangles')} dims={c.get('dims')} cgal={[e for e in c['erreurs'] if 'CGAL' in e][:1]}"
            # Comme le site : le rendu de la pièce corrigée revient à l'IA, qui écrit sa réponse finale.
            if c["rc"] == 0 and c.get("triangles"):
                subprocess.run([sys.executable, f"{os.path.dirname(os.path.abspath(__file__))}/rendu-stl.py", out + ".stl", out + ".png"], capture_output=True)
                img2 = base64.b64encode(open(out + ".png", "rb").read()).decode()
                suite = msgs + [{"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in r.content]},
                                {"role": "user", "content": [{"type": "tool_result", "tool_use_id": build.id, "content": [{"type": "text", "text": msg_ok}, {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img2}}]}]}]
                with client.messages.stream(model="claude-sonnet-5-5", max_tokens=32000, system=system, tools=tools, tool_choice={"type": "auto"}, output_config={"effort": "low"}, messages=suite) as f2:
                    r2 = f2.get_final_message()
                texte = " ".join(b.text for b in r2.content if b.type == "text").strip().replace("\n", " ")
                if any(b.type == "tool_use" and b.name == "build_parametric_model" for b in r2.content): extra += " | ⚠ 2e correction"
        mots = len(texte.split())
        parle_rendu = bool(re.search(r"\b(render|rendu|preview|aperçu|image|grey|gris)\b", texte, re.I))
        stats.append((mots, parle_rendu))
        extra += f" | {mots} mots{' | ⚠ parle du rendu' if parle_rendu else ''}"
        total += 1; ok += obtenu == attendu
        print(f"{'✅' if obtenu == attendu else '❌'} {nom} #{k} — attendu {attendu}, obtenu {obtenu} | « {texte[:700]} »{extra}", flush=True)
print(f"\n{ok}/{total} conformes | réponse finale : {sum(m for m, _ in stats) / max(len(stats), 1):.0f} mots en moyenne, max {max([m for m, _ in stats] or [0])} | parle du rendu : {sum(p for _, p in stats)}/{len(stats)}")
