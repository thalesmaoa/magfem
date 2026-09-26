# magfem (Python)

Controle o [MagFEM](https://thalesmaia.com/tools/magfem-web/) — elementos finitos magnéticos 2D no
navegador — a partir de scripts. Sem dependências além do Python ≥ 3.9.

```bash
pip install ./bridge/python      # ou, sem instalar: cd bridge/python && python -m magfem
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

No app, clique em **Script local** (barra de status), informe a porta e cole a chave. Os comandos do
script aparecem no histórico e o desenho muda ao vivo. O "exportar código" do app gera um script que
recria o modelo — dá para colá-lo inteiro em `mf.run(...)`.

Exemplo completo: [`examples/forca_varredura.py`](examples/forca_varredura.py).

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
