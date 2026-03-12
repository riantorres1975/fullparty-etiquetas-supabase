"""
build_exe.py — Empaqueta servidor_etiquetas.py como .exe con PyInstaller
Ejecutar desde la carpeta del proyecto:
    python build_exe.py
"""

import subprocess
import sys
import os

def build():
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--noconsole",               # Sin ventana de consola
        "--name", "servidor_etiquetas",
        "--distpath", "dist",
        "--workpath", "build",
        "--specpath", "build",
        # Incluir datos necesarios de reportlab
        "--collect-data", "reportlab",
        "--collect-data", "python_barcode",
        "servidor_etiquetas.py"
    ]

    print("🔨 Compilando servidor_etiquetas.exe...")
    print(f"   Comando: {' '.join(cmd)}\n")

    result = subprocess.run(cmd, check=False)

    if result.returncode == 0:
        exe_path = os.path.join("dist", "servidor_etiquetas.exe")
        size_mb = os.path.getsize(exe_path) / (1024 * 1024)
        print(f"\n✅ Compilado exitosamente: {exe_path} ({size_mb:.1f} MB)")
        print("   Ahora corre: npm run build")
    else:
        print("\n❌ Error en la compilación. Revisa los mensajes arriba.")
        sys.exit(1)

if __name__ == "__main__":
    build()
