# Suporte de homologação: conferência privada do login principal, sem alterar a senha no Auth.
"""Verify only local primary login and update its private fixture if needed.
Never changes a password in Auth, prints credentials or follows HTTP redirects.
"""
import getpass
import json
import os
import sys
import warnings
from pathlib import Path
import tempfile
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Recusa redirecionamento para impedir que a verificação de credenciais deixe o destino local.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Redirect recusado.")


# Coordena a conferência do login local e a atualização exclusiva da fixture privada.
def main():
    private_value = os.environ.get("IGA_HOMO_PRIVATE")
    if not private_value:
        raise RuntimeError("Defina IGA_HOMO_PRIVATE.")
    private = Path(private_value).resolve(strict=True)
    repo = Path(__file__).resolve().parents[2]
    if private == repo or repo in private.parents:
        raise RuntimeError("A pasta privada deve ficar fora do Git.")
    config = json.loads((private / "local-config.json").read_text())
    parsed = urllib.parse.urlsplit(config.get("API_URL") or config.get("api_url") or config.get("apiUrl"))
    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.port != 55421
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ("", "/")):
        raise RuntimeError("Destino local inválido.")
    key = config.get("ANON_KEY") or config.get("anon_key") or config.get("PUBLISHABLE_KEY")
    if not key:
        raise RuntimeError("Chave pública local ausente.")
    fixtures_file = private / "fixtures.json"
    original = fixtures_file.read_text()
    fixtures = json.loads(original)
    primary = fixtures["users"]["primary"]
    if primary.get("email") != "primary@iga-homologation.example" or not primary.get("id") or not primary.get("password"):
        raise RuntimeError("Fixture principal não confirmada.")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    # Confere senha e identidade apenas na API local e encerra somente a sessão desta verificação.
    def verify(password):
        request = urllib.request.Request(
            "http://127.0.0.1:55421/auth/v1/token?grant_type=password",
            data=json.dumps({"email": primary["email"], "password": password}).encode(),
            headers={"apikey": key, "Content-Type": "application/json"}, method="POST")
        try:
            with opener.open(request, timeout=15) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            details = json.loads(error.read())
            if error.code in (400, 401) and (details.get("code") == "invalid_credentials"
                    or details.get("error_code") == "invalid_credentials"):
                return False
            raise RuntimeError("Login local não pôde ser conferido.") from None
        if result.get("user", {}).get("id") != primary["id"] or result.get("user", {}).get("email") != primary["email"]:
            raise RuntimeError("Identidade diferente da fixture esperada.")
        # Close only this verification session, without touching the browser login.
        token = result.get("access_token")
        if token:
            logout = urllib.request.Request("http://127.0.0.1:55421/auth/v1/logout?scope=local",
                data=b"", headers={"apikey": key, "Authorization": "Bearer " + token}, method="POST")
            try:
                with opener.open(logout, timeout=15):
                    pass
            except Exception:
                pass
        return True

    if verify(primary["password"]):
        print("APROVADO: login do principal conferido. A senha do arquivo privado continua válida.")
        print("Nenhuma alteração foi necessária.")
        return
    print("A senha anterior da fixture não foi aceita. O Auth não será alterado.")
    if not sys.stdin.isatty():
        raise RuntimeError("Execute em terminal interativo; entrada oculta indisponível.")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        password = getpass.getpass("Digite aqui no Ubuntu a senha que você guardou (não será exibida): ")
    if len(password) < 8 or not verify(password):
        raise RuntimeError("Senha atual não confirmada; arquivo privado preservado.")
    # Refuse overwriting a file that another process changed during verification.
    if fixtures_file.read_text() != original:
        raise RuntimeError("Arquivo privado mudou durante a conferência.")
    fixtures["users"]["primary"]["password"] = password
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=private, prefix=".primary-fixture-", delete=False) as output:
            temporary = Path(output.name)
            os.chmod(temporary, 0o600)
            json.dump(fixtures, output, indent=2, ensure_ascii=False)
            output.write("\n")
        os.replace(temporary, fixtures_file)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    print("APROVADO: login do principal conferido e senha atual sincronizada somente no arquivo privado.")
    print("Nenhuma senha foi alterada no Auth. Nenhuma credencial foi exibida.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("NÃO CONCLUÍDO: conferência do principal. Nenhuma credencial foi exibida; mantenha a sessão aberta.")
        raise SystemExit(1)
