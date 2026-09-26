classdef MagFEM < handle
    % MagFEM  Controla o MagFEM (no navegador) pela ponte local.
    %   Rode antes, num terminal:  python -m magfem   (mostra a porta e a chave)
    %   No app: "Script local" -> porta e chave.
    %
    %   mf = MagFEM('CHAVE');            % porta 8765
    %   mf.set_var('g', '0.5 mm');
    %   mf.solve();
    %   fx = mf.result('Fx');
    %   [t, i] = mf.series('Primario_I');
    %   mf.run('g.circle((0, 0), r=5)');  % qualquer linha do console do MagFEM
    properties
        base
        key
    end
    methods
        function obj = MagFEM(key, port)
            if nargin < 2, port = 8765; end
            obj.key = key;
            obj.base = sprintf('http://127.0.0.1:%d', port);
        end
        function v = run(obj, code)
            % Executa linhas do console; devolve o valor da última. Erro -> error().
            % Formulário key=...&code=... (o webwrite do Octave só envia formulário; o Matlab também aceita).
            opts = weboptions('Timeout', 3600);
            res = webwrite([obj.base '/run'], 'key', obj.key, 'code', code, opts);
            if ischar(res), res = jsondecode(res); end
            if ~res.ok
                msg = res.error;
                if isfield(res, 'line') && ~isempty(res.line), msg = [msg ' (linha: ' res.line ')']; end
                error('MagFEM:run', '%s', msg);
            end
            v = [];
            if isfield(res, 'value'), v = res.value; end
        end
        function set_var(obj, name, expr)
            obj.run(sprintf('g.var(%s, %s)', MagFEM.q(name), MagFEM.q(expr)));
        end
        function solve(obj, physics)
            if nargin < 2, obj.run('s.solve()'); else, obj.run(sprintf('s.solve(%s)', MagFEM.q(physics))); end
        end
        function v = result(obj, name)
            v = obj.run(sprintf('r.result(%s)', MagFEM.q(name)));
        end
        function [t, y] = series(obj, name)
            v = obj.run(sprintf('r.series(%s)', MagFEM.q(name)));
            if iscell(v), t = v{1}; y = v{2}; else, t = v(1, :); y = v(2, :); end
        end
    end
    methods (Static)
        function s = q(v)
            % Texto entre aspas duplas para o console (escapa \ e ").
            if isnumeric(v), v = num2str(v, 15); end
            v = char(v);
            s = ['"' strrep(strrep(v, '\', '\\'), '"', '\"') '"'];
        end
    end
end
