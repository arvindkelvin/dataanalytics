import { EdaDialogAbstract, EdaDialogCloseEvent, EdaDialog } from '@eda/shared/components/shared-components.index';
import { Component } from '@angular/core';


@Component({
  selector: 'app-alert-dialog',
  templateUrl: './alert-dialog.component.html',
  styleUrls: ['./alert-dialog.component.css']
})

export class AlertDialogComponent extends EdaDialogAbstract {
  public dialog: EdaDialog;

  constructor() {
    super();
    this.dialog = new EdaDialog({
      show: () => this.onShow(),
      hide: () => this.onClose(EdaDialogCloseEvent.NONE),
      title: '',
      style :  {width: '55%', height: '45%', top:"-4em", left:'1em'}
    });
  }

  close(execute: boolean) {
    this.onClose(EdaDialogCloseEvent.NONE, execute);
  }
  onShow(): void {
  }
  onClose(event: EdaDialogCloseEvent, response?: any): void {
    return this.controller.close(event, response);
  }


}