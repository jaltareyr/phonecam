"""Create a local development TLS certificate for PhoneCam's LAN endpoint."""
import argparse
import ipaddress
import socket
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


parser = argparse.ArgumentParser()
parser.add_argument("--ip", action="append", default=[], help="PC LAN IP address; repeat for multiple interfaces")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / "certs"
out.mkdir(exist_ok=True)
ips = {ipaddress.ip_address(ip) for ip in args.ip}
ips.add(ipaddress.ip_address("127.0.0.1"))
try:
    for info in socket.getaddrinfo(socket.gethostname(), None, family=socket.AF_INET):
        ips.add(ipaddress.ip_address(info[4][0]))
except OSError:
    pass
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
names = [x509.DNSName("localhost"), *[x509.IPAddress(ip) for ip in sorted(ips, key=str)]]
now = datetime.now(timezone.utc)
certificate = (
    x509.CertificateBuilder()
    .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "PhoneCam local development")]))
    .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "PhoneCam local development")]))
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now - timedelta(minutes=5))
    .not_valid_after(now + timedelta(days=30))
    .add_extension(x509.SubjectAlternativeName(names), critical=False)
    .sign(key, hashes.SHA256())
)
(out / "server-key.pem").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
(out / "server-cert.pem").write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
print("Created local certificate for:", ", ".join(str(ip) for ip in sorted(ips, key=str)))
print("Private key stays in", out)
