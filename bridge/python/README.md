# magfem (Python)

Controle o [MagFEM](https://thalesmaia.com/tools/magfem-web/) — elementos finitos magnéticos 2D no
navegador — a partir de scripts. Sem dependências além do Python ≥ 3.9.

```bash
pip install "git+https://github.com/thalesmaoa/magfem#subdirectory=bridge/python"
# ou, com o repositório clonado: pip install ./bridge/python  (ou, sem instalar: cd bridge/python && python -m magfem)
```

```python
import magfem

mf = magfem.connect()            # sobe a ponte local, mostra porta e chave e espera a página conectar
mf.set_var("g", "0.5 mm")        # variável do projeto
mf.solve()                       # gera a malha se preciso, resolve e espera
print(mf.result("Fx"))           # número de uma variável de resultado (nome dado em Resultados)
print(mf.results())              # {nome: (valor, unidade)}
t, i = mf.series("Primario_I")   # transitório: curva no tempo
mf.run('g.circle((0, 0), r=5)')  # qualquer linha do console do MagFEM
```

Para não colar a chave toda vez, fixe-a: `python -m magfem --key minha-chave` (o app lembra a última porta e chave).

## Console no terminal

`python -m magfem` sobe a ponte e abre um console `magfem>` ligado à página, como o console da web: cada linha
digitada roda no app (`help()` lista os comandos; ↑ repete; Ctrl+D sai). Com ela aberta, scripts em outro terminal
usam a mesma ponte com `magfem.connect(key="<chave>")`, e seus comandos aparecem marcados com `[script]`.

## Erros nos scripts

Um comando que falha no app levanta `magfem.BridgeError` (com a mensagem e a linha); a página que não conecta a tempo
também:

```python
import magfem

try:
    mf = magfem.connect(key="<chave>", timeout=60)
    mf.run("g.circle((0, 0), r=5)")
    mf.solve()
    print(mf.result("Fx"))
except magfem.BridgeError as e:
    print("MagFEM:", e)
```

No app, clique em **Script local** (barra de status), informe a porta e cole a chave. Os comandos do
script aparecem no histórico e o desenho muda ao vivo. O "exportar código" do app gera um script que
recria o modelo — dá para colá-lo inteiro em `mf.run(...)`.

Exemplos:
- [`examples/forca_varredura.py`](examples/forca_varredura.py): varre a corrente de um condutor e compara a
  força com F = I×B.
- [`examples/contator.py`](examples/contator.py): fechamento de um atuador de êmbolo (contator CC) com
  circuito, campo e mecânica acoplados por código — λ ← λ + Δt·(V − R·i), m·g″ = F_mola − F_mag, e a
  geometria remontada a cada passo. Mostra o afundamento de corrente típico do fechamento.

`reset()` começa um projeto novo (com as bibliotecas padrão) pelo script, sem mexer no arquivo aberto.

## Outras linguagens (HTTP/JSON)

`python -m magfem` mostra a chave; depois é só HTTP:

```bash
curl -s -X POST http://127.0.0.1:8765/run -H "X-MagFEM-Key: <chave>" \
     -d '{"code": "s.solve()\nr.result(\"Fx\")"}'
# {"ok": true, "value": -9.97, "out": []}
```

`GET /status` diz se há uma página conectada. Em erro: `"ok": false`, `"error"` e a `"line"` que falhou.

## Segurança

A ponte escuta só em `127.0.0.1`, aceita WebSocket apenas da página do MagFEM (thalesmaia.com ou
localhost) e exige a chave de pareamento, gerada a cada execução (ou fixa com `--key`).

## Testes

```bash
cd bridge/python && python -m unittest discover -s tests
```
