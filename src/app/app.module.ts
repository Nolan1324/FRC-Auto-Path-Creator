import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  MatButtonModule,
  MatCardModule, MatCheckboxModule,
  MatChipsModule, MatExpansionModule,
  MatIconModule,
  MatInputModule,
  MatListModule, MatPaginatorModule, MatSelectModule,
  MatTableModule
} from '@angular/material';
import {DragDropModule} from '@angular/cdk/drag-drop';
import {FormsModule} from '@angular/forms';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    NoopAnimationsModule,
    MatTableModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatListModule,
    MatChipsModule,
    DragDropModule,
    FormsModule,
    MatExpansionModule,
    MatSelectModule,
    MatPaginatorModule,
    MatCheckboxModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
