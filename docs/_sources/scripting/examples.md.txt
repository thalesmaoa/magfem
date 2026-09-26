# Exemplos

Os exemplos ficam em
[`bridge/python/examples`](https://github.com/thalesmaoa/magfem/tree/main/bridge/python/examples). Rode a ponte,
conecte a página e execute o exemplo (ou deixe o próprio exemplo subir a ponte).

## Varredura de força

[`forca_varredura.py`](https://github.com/thalesmaoa/magfem/blob/main/bridge/python/examples/forca_varredura.py)
monta um condutor redondo num campo uniforme de 0,1 T (imposto pelo A prescrito na borda) e varre a corrente,
comparando a força calculada pelo tensor de Maxwell com a analítica F = I·B·L:

```python
mf = magfem.connect()
mf.run(MODELO)                      # geometria, materiais, contorno e tabela de força
for corrente in (10, 50, 100, 200):
    mf.set_var("I", str(corrente))
    mf.solve("n2")
    print(corrente, mf.result("Fx"), -corrente * 0.1)
```

## Contator

[`contator.py`](https://github.com/thalesmaoa/magfem/blob/main/bridge/python/examples/contator.py) simula o
**fechamento de um contator CC** (atuador de êmbolo axissimétrico), acoplando por código três fenômenos que o app
sozinho não junta:

- **elétrico**: λ ← λ + Δt·(V − R·i), com a corrente tirada de λ(g, i) do FEM;
- **mecânico**: m·g″ = F_mola(g) − F_mag(g, i), com a força magnética pelo tensor de Maxwell no êmbolo;
- **geometria**: a cada passo o entreferro g muda, e o modelo é remontado, malhado e resolvido.

```bash
python examples/contator.py --key minha-chave --passos 60
```

A saída mostra t, g, i, λ e F e grava `contator.csv`. Ela reproduz o afundamento de corrente típico do fechamento:
quando o êmbolo acelera, a indutância cresce e a corrente cai.

## Ideias

- **Otimização**: passe `mf.set_var` e `mf.result` para o `scipy.optimize.minimize` e otimize uma cota
  (entreferro, espessura de um ímã) por um objetivo (força, indutância, perdas).
- **Mapas**: varra duas variáveis e monte um mapa de λ(i, x) para um modelo de circuito.
