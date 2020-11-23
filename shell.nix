let
  pkgs = import (builtins.fetchTarball {
    url="https://github.com/NixOS/nixpkgs/archive/838a38c4c7a33fbb16f02daeb27a7677ceafe7d7.tar.gz";
    sha256 = "1y66shvvnigrk8bw07mwgjczb183y485rvaa2yad9ni5d9bpwbcm";
  }) {};
in
  pkgs.mkShell {
    buildInputs = with pkgs; [
      gettext zip glib
    ];
  }
