const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib
const Clutter = imports.gi.Clutter
const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

class Extension {
    constructor() {
        this._indicator = null;
        this.open = false;

        this.bat60 = null;
        this.bat80 = null;
        this.bat100 = null;

        this.coolerBoost = null;

        this.gpuTemp = null;
        this.gpuFan = null;
        this.cpuTemp = null;
        this.cpuFan = null;
    }
    
    enable() {
        log(`Enabling ${Me.metadata.name}...`);

        // ===== INDICATOR ===== //
        let indicatorName = `${Me.metadata.name} Indicator`;
        // Create a panel button
        this._indicator = new PanelMenu.Button(0.0, indicatorName, false);
        this._indicator.menu.connect('open-state-changed', this.openStateChanged.bind(this))
        // Add an icon
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'laptop-symbolic'}),
            style_class: 'system-status-icon'
        });
        this._indicator.add_child(icon);
        // `Main.panel` is the actual panel you see at the top of the screen,
        // not a class constructor.
        Main.panel.addToStatusArea(indicatorName, this._indicator);

        // ===== COOLER BOOST SWITCH ===== //
        this.coolerBoost = new PopupMenu.PopupSwitchMenuItem('CoolerBoost', true);
        this.coolerBoost.connect('toggled', this.coolerBoostToggled);
        this._indicator.menu.addMenuItem(this.coolerBoost);

        // ====== BATTERY CHARGING TRESHOLD MENU ===== //
        let subMenu = new PopupMenu.PopupSubMenuMenuItem('Battery Charging Treshold');
        this.bat60 = new PopupMenu.PopupImageMenuItem('50%/60%', 'checkbox-symbolic');
        this.bat80 = new PopupMenu.PopupImageMenuItem('70%/80%', 'checkbox-symbolic');
        this.bat100 = new PopupMenu.PopupImageMenuItem('100%', 'checkbox-symbolic');
        this.bat60.connect('activate', this.bat60Activate.bind(this))
        this.bat80.connect('activate', this.bat80Activate.bind(this))
        this.bat100.connect('activate', this.bat100Activate.bind(this))
        subMenu.menu.addMenuItem(this.bat60);
        subMenu.menu.addMenuItem(this.bat80);
        subMenu.menu.addMenuItem(this.bat100);
        this._indicator.menu.addMenuItem(subMenu);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ===== HARDWARE INFO ===== //
        let gpuTemp = new PopupMenu.PopupBaseMenuItem();
        gpuTemp.add_child(new St.Label({text: 'GPU Temp',}));
        gpuTemp.add_child(this.gpuTemp = new St.Label({
            text: '',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        }));
        this._indicator.menu.addMenuItem(gpuTemp);
        let gpuFan = new PopupMenu.PopupBaseMenuItem();
        gpuFan.add_child(new St.Label({text: 'GPU Fan Speed',}));
        gpuFan.add_child(this.gpuFan = new St.Label({
            text: '',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        }));
        this._indicator.menu.addMenuItem(gpuFan);
        let cpuTemp = new PopupMenu.PopupBaseMenuItem();
        cpuTemp.add_child(new St.Label({text: 'CPU Temp',}));
        cpuTemp.add_child(this.cpuTemp = new St.Label({
            text: '',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        }));
        this._indicator.menu.addMenuItem(cpuTemp);
        let cpuFan = new PopupMenu.PopupBaseMenuItem();
        cpuFan.add_child(new St.Label({text: 'CPU Fan Speed',}));
        cpuFan.add_child(this.cpuFan = new St.Label({
            text: '',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        }));
        this._indicator.menu.addMenuItem(cpuFan);
    }

    openStateChanged(_, isOpen) {
        this.open = isOpen;
        if(isOpen) {
            this.loadConfig();
        }
    }
    
    loadConfig() {
        log('Reloading...')
        let proc = Gio.Subprocess.new(['pkexec', 'isw', '-c'], Gio.SubprocessFlags.STDOUT_PIPE);
        proc.communicate_utf8_async(null, null, this.iswC.bind(this));
    }

    iswC(proc, res) {
        const [,stdout] = proc.communicate_utf8_finish(res);
        let ecDump = stdout.split('\n')
            .map(line => line.split(/ +/)
                .slice(1, -1) // skip index and hexdump
                .map(hex => parseInt(hex, 16))); // parse hex values

        // ===== CURRENT BATTERY TRESHOLD ===== //
        let curTreshold = ecDump[14][15] - 0x80;
        this.bat60.setIcon(curTreshold === 60 ? 'checkbox-checked-symbolic' : 'checkbox-symbolic');
        this.bat80.setIcon(curTreshold === 80 ? 'checkbox-checked-symbolic' : 'checkbox-symbolic');
        this.bat100.setIcon(curTreshold === 100 ? 'checkbox-checked-symbolic' : 'checkbox-symbolic');

        // ===== CURRENT COOLER BOOST ===== //
        let coolerBoost = ecDump[9][8] === 0x80;
        this.coolerBoost.setToggleState(coolerBoost);

        // ===== SHOW HARDWARE INFO ===== //
        let cpuFan = (ecDump[12][12] << 8) + ecDump[12][13];
        let gpuFan = (ecDump[12][10] << 8) + ecDump[12][11];
        this.gpuTemp.set_text(`${ecDump[8][0]}°C`);
        this.gpuFan.set_text(`${gpuFan ? Math.round(478000 / gpuFan) : 0} RPM`);
        this.cpuTemp.set_text(`${ecDump[6][8]}°C`);
        this.cpuFan.set_text(`${cpuFan ? Math.round(478000 / cpuFan) : 0} RPM`);

        // ===== REFRESH IN 1 SECOND ===== //
        if(this.open) {
            Mainloop.timeout_add_seconds(1, this.loadConfig.bind(this));
        }
    }

    bat60Activate() {
        GLib.spawn_command_line_async(`pkexec isw -t 60`);
    }

    bat80Activate() {
        GLib.spawn_command_line_async(`pkexec isw -t 80`);
    }

    bat100Activate() {
        GLib.spawn_command_line_async(`pkexec isw -t 100`);
    }
    
    coolerBoostToggled(_, active) {
        GLib.spawn_command_line_async(`pkexec isw -b ${active ? 'on' : 'off'}`);
    }
    
    // REMINDER: It's required for extensions to clean up after themselves when
    // they are disabled. This is required for approval during review!
    disable() {
        log(`disabling ${Me.metadata.name}`);

        this._indicator.destroy();
        this._indicator = null;
    }
}


function init() {
    log(`initializing ${Me.metadata.name}`);
    
    return new Extension();
}

