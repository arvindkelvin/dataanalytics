import {Component, Input, ViewChild, AfterViewInit, DoCheck, NgZone} from '@angular/core';
import {EdaDialog} from './eda-dialog';
import {Dialog} from 'primeng/dialog';

@Component({
    selector: 'eda-dialog',
    templateUrl: './eda-dialog.component.html',
})
export class EdaDialogComponent implements AfterViewInit {
    display = false;
    height: number = null;
    width: number = null;

    @Input() inject: EdaDialog;
    @ViewChild('dialog') dialog: Dialog;

    constructor(private ngZone: NgZone) { }

    ngAfterViewInit() {
        this.inject.dialog = this.dialog;
        window.setTimeout(() => { this.display = true});
        this.ngZone.runOutsideAngular(() => {
            setTimeout(() => {
                // this.dialog.center();
            }, 0);
        });
    }

    // ngDoCheck() {
    //     this.ngZone.runOutsideAngular(() => {
    //         setTimeout(() => {
    //             if (this.dialog !== undefined && this.dialog.container !== undefined) {
    //                 if (this.height != null && this.dialog.container.offsetHeight !== this.height ||
    //                     this.width != null && this.dialog.container.offsetWidth !== this.width) {
    //                     this.dialog.center();
    //                 }
    //
    //                 this.height = this.dialog.container.offsetHeight;
    //                 this.width = this.dialog.container.offsetWidth;
    //             }
    //         }, 10);
    //     });
    // }
}
