{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    gettext zip glib
    gnome.gnome-shell
  ];
}
