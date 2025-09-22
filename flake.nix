{

  inputs = { nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable"; };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in {

      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [ pkgs.gettext pkgs.zip pkgs.glib pkgs.gnome-shell ];
      };

    };
}
