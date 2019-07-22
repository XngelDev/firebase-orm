
 

import 'firebase/firestore';
import { ModelInterface } from "./interfaces/model.interface";
import { ModelOptions } from "./interfaces/model.options.interface";
import { FirestoreOrmRepository } from "./repository";
import * as firebase from "firebase/app";
import 'firebase/firestore';
import { FireSQL } from "@arbel/firesql";
import { Query, LIST_EVENTS } from "./query";
import { Moment } from "moment";
import { FieldOptions } from "./interfaces/field.options.interface";
import { ObserveLoadModelInterface } from "./interfaces/observe.load.model.interface";
import { ObserveRemoveModelInterface } from "./interfaces/observe.remove.model.interface";
import { ObserveSaveModelInterface } from "./interfaces/observe.save.model.interface";
import { ModelAllListOptions } from './interfaces/model.alllist.options.interface';

import * as moment_ from "moment";

const moment = moment_;

export class BaseModel implements ModelInterface { 
 
    protected static CREATED_AT_FLAG: string = "created_at";
    protected static UPDATED_AT_FLAG: string = "updated_at";

    id!: string;
    referencePath!: string;
    protected _referencePath!: string;
    protected isAutoTime!: boolean;
    created_at!: number;
    updated_at!: number;
    protected is_exist: boolean = false;
    pathId!: string;
    protected currentModel!: this & BaseModel; 
    protected static aliasFieldsMapper: any = {};
    protected static textIndexingFields: any = {};
    protected static ignoreFields: any = [];
    protected static fields: any = {};
    protected static requiredFields: Array<string> = [];
    protected static internalFields: Array<string> = [];
    protected repository!: FirestoreOrmRepository;
    protected globalModel!: this;
    protected currentQuery!: any;
    protected data: any = {};
    protected currentQueryListener!: any;
    protected modelType!: any;

    
    constructor(){
        var connectionName = FirestoreOrmRepository.DEFAULT_KEY_NAME;
        if(this['connectionName']){
            connectionName = this['connectionName'];
        }
        this.repository = FirestoreOrmRepository.getGlobalConnection(connectionName);
        this.initProp();
    }

    initProp(){
      if(!this['storedFields']){
        this['storedFields'] = [];
      }
      if(!this['fields']){
        this['fields'] = {};
      }
      if(!this['requiredFields']){
        this['requiredFields'] = [];
      }
      if(!this['aliasFieldsMapper']){
        this['aliasFieldsMapper'] = [];
      }
    }

    parseTextIndexingFields(text:string){
      var result = {};
      var edgeSymbol = '~~~';
      for(var i = 0;text.length > i;i++){
        for(var x = 1;x < text.length;x++){
          var subString = text.substr(i,text.length-x);
          if(i == 0){
            subString = edgeSymbol + subString;
          }else if(i + 1 == text.length){
            subString =  subString + edgeSymbol;
          }
          result[btoa(subString)] = true;
        }
       
      }
      return result;
    }



    getId() {
      return this.id;
    }

    getPathId() {
      return this.pathId;
    }

    initFields(): void {}

    isExist(): boolean {
      return this.is_exist;
    }

    async getOneRel<T>(model: { new (): T }): Promise<T & BaseModel> {
      var object: any = this.getModel(model);
      var that: any = this;
      return await object.load(that[object.getPathId()]);
    }

    async getManyRel<T>(model: {
      new (): T;
    }): Promise<Array<T & BaseModel>> {
      var object: any = this.getModel(model);
      var that: any = this;
      return await object
        .where(object.getPathId(), "==", that[object.getPathId()])
        .get();
    }

    getModel<T>(model: { new (): T }): T & BaseModel {
        var object: any = this.getRepository().getModel(model);
        var keys = object.getPathListKeys();
        var that: any = this;
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (that[key]) {
            object[key] = that[key];
          } else if (key == that.pathId && that.getId()) {
            object[key] = that.getId();
          }
        }
        return object;
      }

      
    getCurrentModel(): this {
        var object: any = this.getRepository().getModel(this.getModelType());
        var keys = object.getPathListKeys();
        var that: any = this;
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (that[key]) {
            object[key] = that[key];
          } else if (key == that.pathId && that.getId()) {
            object[key] = that.getId();
          }
        }
        return object;
      }

    toString(): string {
      var res:any = Object.assign({}, this.getDocumentData());
      if (this.getId()) {
        res.id = this.getId();
      }
      return JSON.stringify(res);
    }

    /**
     * load from string
     * @return fields array
     */
    loadFromString(jsonString: string): this {
      var model: any = this;
      var params = JSON.parse(jsonString);
      this.createFromData(params, model);
      return model;
    }

    /**
     * Init object from string
     * @return fields array
     */
    initFromString(jsonString: string): this {
      var model: any = this.getCurrentModel();
      var params = JSON.parse(jsonString);
      this.createFromData(params, model);
      return model;
    }

    getReference(): firebase.firestore.CollectionReference {
      return this.getRepository().getCollectionReferenceByModel(this);
    }

    getDocReference(): firebase.firestore.DocumentReference {
      return this.getReference().doc(this.getId());
    }

    setModelType(model: any): this {
      this.modelType = model;
      return this;
    }

    getModelType() {
      return this.modelType;
    }

    static where<T>(
      this: { new(): T },
      fieldPath: string,
      opStr: firebase.firestore.WhereFilterOp,
      value: any
    ): Query<T>{
      var that:any = this;
      var query = that.query().where(fieldPath, opStr, value); 
      return query;
    }

     where<T>(
      this: { new(): T },
      fieldPath: string,
      opStr: firebase.firestore.WhereFilterOp,
      value: any
    ): Query<T>{
      var that:any = this;
      var query = that.query().where(fieldPath, opStr, value);
      return query;
    }

    async getOne() {
      if (!this.currentQuery) {
        var that: any = this;
        this.currentQuery = this.getRepository().getCollectionReferenceByModel(
          that
        );
      }
      return await this.currentQuery.get();
    }

    setId(id: string) {
      this.id = id;
      return this;
    }

    async load(
      id: string,
      params: { [key: string]: string } = {}
    ): Promise<this> {
      var that: any = this;
      if (that.observeLoadBefore) {
        that.observeLoadBefore();
      }
      var res: any = null;
      this.setId(id);
      if (this.getRepository()) {
        res = await this.getRepository().load(this, id, params);
      } else {
        console.error("No repository!");
      }
      if (res && res.observeLoadAfter) {
        res.observeLoadAfter();
      }
      return this;
    }

    async init(
      id: string,
      params: { [key: string]: string } = {}
    ): Promise<this | null> {
      var object = this.getCurrentModel();
      var res:any;
      object.setId(id);
      if (object.getRepository()) {
        res = await this.getRepository().load(object, id, params);
      } else {
        console.error("No repository!");
      }
      return res;
    }

    static async init<T>(this: { new(): T },
      id: string,
      params: { [key: string]: string } = {}
    ): Promise<T | null> {
      var object:any = new this();
      var res:any;
      object.setId(id);
      if (object.getRepository()) {
        res = await object.getRepository().load(object, id, params);
      } else {
        console.error("No repository!");
      }
      return res;
    }

    async remove(): Promise<boolean> {
      try {
        var that: any = this;
        if (that.observeRemoveBefore) {
          that.observeRemoveBefore();
        }
        await this.getDocReference().delete();
        if (that.observeRemoveAfter) {
          that.observeRemoveAfter();
        }
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    }

    static query<T>(this: { new(): T }): Query<T> {
      var query = new Query<T>();
      var object:any = new this();
      object.setModelType(this);
      query.init(object);
      return query;
    } 

    
     query<T>(this: { new(): T }): Query<T> {
      var query = new Query<T>();
      var that:any = this;
      var object:any = that.getCurrentModel();
      query.init(object);
      return query;
    } 

    static async getAll<T>(this: { new(): T },
      whereArr?: Array<any>,
      orderBy?: {
        fieldPath: string | firebase.firestore.FieldPath;
        directionStr?: firebase.firestore.OrderByDirection;
      },
      limit?: number,
      params?: { [key: string]: string }
    ): Promise<Array<T>> {
      var object:any = new this();
      object.setModelType(this);
      var query = object.query();
      if (whereArr && whereArr[0] && whereArr[0].length == 3) {
        for (var i = 0; i < whereArr.length; i++) {
          query.where(whereArr[i][0], whereArr[i][1], whereArr[i][2]);
        }
      }
      if (limit) {
        query.limit(limit);
      }
      var res: any = await query.get();
      return res;
    }

    
     async getAll(whereArr?: Array<any>,
      orderBy?: {
        fieldPath: string | firebase.firestore.FieldPath;
        directionStr?: firebase.firestore.OrderByDirection;
      },
      limit?: number,
      params?: { [key: string]: string }
    ): Promise<Array<this>> {
      var that:any = this.getModelType();
      var object:any = this.getCurrentModel();
      var query = object.query();
      if (whereArr && whereArr[0] && whereArr[0].length == 3) {
        for (var i = 0; i < whereArr.length; i++) {
          query.where(whereArr[i][0], whereArr[i][1], whereArr[i][2]);
        }
      }
      if (limit) {
        query.limit(limit);
      }
      var res: any = await query.get();
      return res;
    }

    getRepository() {
      return this.repository;
    }

    setRepository(repository: FirestoreOrmRepository) {
      this.repository = repository;
      return this;
    }

    /**
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
    on(callback: CallableFunction): CallableFunction {
      var that: any = this;
      var res = () => {};
      if (!that.getId()) {
        console.error(
          this.referencePath +
            "/:" +
            this.pathId +
            " - " +
            "The model not stored yet"
        );
        return res;
      } else if (!that.getReference()) {
        console.error(
          "The model path params is not set and can't run on() function "
        );
        return res;
      } else {
        return that
          .getReference()
          .doc(that.getId())
          .onSnapshot((documentSnapshot: any) => {
            var data = documentSnapshot.data();
            for (let key in data) {
              let value = data[key];
              that[key] = value;
            }
            callback(that);
          });
      }
    }

    async sql(
      sql: string,
      asObject: boolean = false,
      isInsideQuery = false
    ): Promise<Array<this>> {
      var result: any = [];
      if (isInsideQuery && !this.getId()) {
        console.error(
          this.referencePath +
            "/:" +
            this.pathId +
            " - " +
            "Can't search inside a model without id!"
        );
        return result;
      } else if (!this.getReference()) {
        console.error(
          "The model path params is not set and can't run sql() function "
        );
        return result;
      }
      var ref: any = !isInsideQuery
        ? this.getReference().parent
        : this.getReference().doc(this.getId());
      const fireSQL = new FireSQL(ref, { includeId: "id" });
      try {
        var sqlResult = await fireSQL.query(sql);
        for (var i = 0; i < sqlResult.length; i++) {
          let data = sqlResult[i];
          if (asObject) {
            result.push(this.createFromData(data));
          } else {
            result.push(data);
          }
        }
        return result;
      } catch (error) {
        console.error(
          this.referencePath +
            "/:" +
            this.pathId +
            " - " +
            "SQL GENERAL ERROR - ",
          error
        );
        return result;
      }
    }

    onSql(
      sql: string,
      callback: CallableFunction,
      asObject: boolean = false,
      isInsideQuery: boolean = false
    ): void {
      var result: any = [];
      if (isInsideQuery && !this.getId()) {
        console.error(
          this.referencePath +
            "/:" +
            this.pathId +
            " - " +
            "Can't search inside a model without id!"
        );
      } else if (!this.getReference()) {
        console.error(
          "The model path params is not set and can't run onSql() function "
        );
      } else {
        var ref: any = !isInsideQuery
          ? this.getReference().parent
            ? this.getReference().parent
            : this.getRepository().getFirestore()
          : this.getReference().doc(this.getId());
        const fireSQL = new FireSQL(ref, { includeId: "id" });
        try {
          const res = fireSQL.rxQuery(sql);
          res.subscribe((sqlResult: any) => {
            for (var i = 0; i < sqlResult.length; i++) {
              let data = sqlResult[i];
              if (asObject) {
                result.push(this.createFromData(data));
              } else {
                result.push(data);
              }
            }
            callback(result);
          });
        } catch (error) {
          console.error(
            this.referencePath +
              "/:" +
              this.pathId +
              " - " +
              "SQL GENERAL ERROR - ",
            error
          );
        }
      }
    }

     async createFromDoc(doc: firebase.firestore.DocumentSnapshot): Promise<this> {
      var object:any = this.getCurrentModel();
      var d:any = doc;
      var data = await doc.data();
      var pathParams = object.getPathListParams();

      for (let key in pathParams) {
        let value = pathParams[key];
        object[key] = value;
      }

      for (let key in data) {
        let value = data[key];
        object[key] = value;
      }
      return object;
    }

    
    static async createFromDoc<T>(this: { new(): T },doc: firebase.firestore.DocumentSnapshot): Promise<T> {
      var object:any = new this();
      object.setModelType(this);
      var d:any = doc;
      var data = await doc.data();
      var pathParams = object.getPathListParams();

      for (let key in pathParams) {
        let value = pathParams[key];
        object[key] = value;
      }

      for (let key in data) {
        let value = data[key];
        object[key] = value;
      }
      return object;
    }


    
    static async createFromDocRef<T>(this: { new(): T },doc: firebase.firestore.DocumentReference): Promise<T | null> {
      var object:any = new this();
      object.setModelType(this);
      var d:any = doc;
      var data = (await doc.get()).data();
      if(data){
          var pathParams = object.getPathListParams();

          for (let key in pathParams) {
            let value = pathParams[key];
            object[key] = value;
          }
    
          for (let key in data) {
            let value = data[key];
            object[key] = value;
          }
          return object;
      }else{
          return null;
      }
     
    }
    
    
     async createFromDocRef<T>(this: { new(): T },doc: firebase.firestore.DocumentReference): Promise<T | null> {
      var object:any = new this();
      object.setModelType(this);
      var d:any = doc;
      var data = (await doc.get()).data();
      if(data){
          var pathParams = object.getPathListParams();

          for (let key in pathParams) {
            let value = pathParams[key];
            object[key] = value;
          }
    
          for (let key in data) {
            let value = data[key];
            object[key] = value;
          }
          return object;
      }else{
          return null;
      }
     
    }

    createFromData(data: Object, targetObject?: this): this {
      var params: any = data;
      var object: any = !targetObject
        ? this.getCurrentModel()
        : targetObject;
      var pathParams = this.getPathListParams();
      for (let key in pathParams) {
        let value = pathParams[key];
        object[key] = value;
      }
      for (let key in params) {
        let value = params[key];
        if (object.aliasFieldsMapper && object.aliasFieldsMapper[key]) {
          object[object.aliasFieldsMapper[key]] = value;
        } else {
          object[key] = value;
        }
      }
      return object;
    }

    initFromData(data: Object, targetObject?: this): this {
      return this.createFromData(data, this);
    }

    initFromDoc(doc: firebase.firestore.DocumentSnapshot) {
      var that: any = this;
      var data = doc.data();
      for (let key in data) {
        let value = data[key];
        that[key] = value;
      }
      return this;
    }

    /**
     * Set document data directly
     * @param key
     * @param value
     */
    setParam(key: string, value: any): this {
      this[key] = value;
      this['storedFields'].push(key);
      return this;
    }

    /**
     * Get document data directly
     * @param key
     * @param value
     */
    getParam(key: string, defaultValue: any): any{
      return typeof this[key] !== 'undefined' ? this[key] : defaultValue
    }

    /**
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
    static onAllList(
      callback: CallableFunction,
      eventType?: LIST_EVENTS
    ): CallableFunction {
      switch (eventType) {
        case LIST_EVENTS.ADDEDD:
          return this.onCreatedList(callback, LIST_EVENTS.ADDEDD);
          break;
        case LIST_EVENTS.REMOVED:
          return this.onAllList(callback, LIST_EVENTS.REMOVED);
          break;
        case LIST_EVENTS.MODIFIED:
          return this.onUpdatedList(callback, LIST_EVENTS.MODIFIED);
          break;
        default:
          return this.onAllList(callback);
          break;
      }
    }

    
    /**
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
     onAllList(
      callback: CallableFunction,
      eventType?: LIST_EVENTS
    ): CallableFunction {
      switch (eventType) {
        case LIST_EVENTS.ADDEDD:
          return this.onCreatedList(callback, LIST_EVENTS.ADDEDD);
          break;
        case LIST_EVENTS.REMOVED:
          return this.onAllList(callback, LIST_EVENTS.REMOVED);
          break;
        case LIST_EVENTS.MODIFIED:
          return this.onUpdatedList(callback, LIST_EVENTS.MODIFIED);
          break;
        default:
          return this.onAllList(callback);
          break;
      }
    }

    /**
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
     onModeList(options: ModelAllListOptions) {
       var that:any = this;
      return that.query()
        .orderBy(BaseModel.CREATED_AT_FLAG)
        .onMode(options);
    }

    
    /**
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener. 
     */
    static onModeList(options: ModelAllListOptions) {
      var that:any = this;
      return that.query()
        .orderBy(this.CREATED_AT_FLAG)
        .onMode(options);
    }

    /**
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
    static onList(
      callback: CallableFunction,
      eventType?: LIST_EVENTS
    ): CallableFunction {
      var that = this;
      var res = () => {};
      var object:any = new this();
      object.setModelType(this);
      if (!object.getReference()) {
        console.error(
          "The model path params is not set and can't run onList() function "
        );
        return res;
      } else {
        return this.query()
          .orderBy(this.CREATED_AT_FLAG)
          .on(callback, eventType);
      }
    }

    
    /**
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
     onList(
      callback: CallableFunction,
      eventType?: LIST_EVENTS
    ): CallableFunction {
      var that:any = this.getModelType();
      var res = () => {};
      var object:any = this.getCurrentModel();
      if (!object.getReference()) {
        console.error(
          "The model path params is not set and can't run onList() function "
        );
        return res;
      } else {
        var that:any = this;
        return that.query()
          .orderBy(BaseModel.CREATED_AT_FLAG)
          .on(callback, eventType);
      }
    }

    /**
     * Get New element in collectio
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
    static onCreatedList(
      callback: CallableFunction,
      eventType?: LIST_EVENTS
    ): CallableFunction {
      var res = () => {};
      var object:any = new this();
      object.setModelType(this);
      if (!object.getReference()) {
        console.error(
          "The model path params is not set and can't run onAddList() function "
        );
        return res;
      }

      var timestamp = new Date().getTime();
      return this.query()
        .orderBy(this.CREATED_AT_FLAG)
        .startAt(timestamp)
        .on(callback, eventType);
    }

    
    /**
     * Get New element in collectio
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
     onCreatedList(
      callback: CallableFunction,
      eventType?: LIST_EVENTS
    ): CallableFunction {
      var res = () => {};
      var that:any = this.getModelType();
      var object:any = this.getCurrentModel();
      if (!object.getReference()) {
        console.error(
          "The model path params is not set and can't run onAddList() function "
        );
        return res;
      }

      var timestamp = new Date().getTime();
      var that:any = this;
      return that.query()
        .orderBy(BaseModel.CREATED_AT_FLAG)
        .startAt(timestamp)
        .on(callback, eventType);
    }

    /**
     * Get Updated element in collectio
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
    onUpdatedList(
      callback: CallableFunction,
      eventType?: LIST_EVENTS
    ): CallableFunction {
      var res = () => {};
      var that:any = this.getModelType();
      var object:any = this.getCurrentModel();
      if (!object.getReference()) {
        console.error(
          "The model path params is not set and can't run onUpdatedList() function "
        );
        return res;
      }
      var timestamp = new Date().getTime();
      var that:any = this;
      return that.query()
        .orderBy(BaseModel.UPDATED_AT_FLAG)
        .startAt(timestamp)
        .on(callback, eventType);
    }

    
    /**
     * Get Updated element in collectio
     * Attaches a listener for QuerySnapshot events. You may either pass
     * individual `onNext` and `onError` callbacks or pass a single observer
     * object with `next` and `error` callbacks. The listener can be cancelled by
     * calling the function that is returned when `onSnapshot` is called.
     *
     * NOTE: Although an `onCompletion` callback can be provided, it will
     * never be called because the snapshot stream is never-ending.
     *
     * @param callback A single object containing `next` and `error` callbacks.
     * @return An unsubscribe function that can be called to cancel
     * the snapshot listener.
     */
    static onUpdatedList(
      callback: CallableFunction,
      eventType?: LIST_EVENTS
    ): CallableFunction {
      var res = () => {}; 
      var object:any = new this();
      object.setModelType(this);
      if (!object.getReference()) {
        console.error(
          "The model path params is not set and can't run onUpdatedList() function "
        );
        return res;
      }
      var timestamp = new Date().getTime();
      return this.query()
        .orderBy(BaseModel.UPDATED_AT_FLAG)
        .startAt(timestamp)
        .on(callback, eventType);
    }

    initAutoTime(): void {
      if (this.isAutoTime) {
        if (!this.created_at) {
          this[BaseModel.CREATED_AT_FLAG] = new Date().getTime();
          this.created_at = new Date().getTime();
        }
        this[BaseModel.UPDATED_AT_FLAG] = new Date().getTime();
        this['storedFields'].push(BaseModel.CREATED_AT_FLAG);
        this['storedFields'].push(BaseModel.UPDATED_AT_FLAG);
        this.updated_at = new Date().getTime();
      }
    }

    getCreatedAt(): Moment | null {
      return this.created_at ? moment.unix(this.created_at / 1000) : null;
    }

    getUpdatedAt(): Moment | null {
      return this.updated_at ? moment.unix(this.updated_at / 1000) : null;
    }

    async save(): Promise<this> {
      var that: any = this;
      if (that.observeSaveBefore) {
        that.observeSaveBefore();
      }
      if (!this.verifyRequiredFields()) {
        return this;
      }
      this.initAutoTime();
      if (this.getRepository()) {
        await this.getRepository().save(this);
      } else {
        console.error("No repository!");
      }
      if (that.observeSaveAfter) {
        that.observeSaveAfter();
      }
      return this;
    }

    getReferencePath(): string {
      return this.referencePath;
    }

    static async find<T>(this: { new(): T },fieldPath: string,
    opStr: firebase.firestore.WhereFilterOp,
    value: any) : Promise<Array<T>>{
        var that : any = this;
        return await that.where(fieldPath,opStr,value).get();
    }
    
    static async findOne<T>(this: { new(): T },fieldPath: string,
    opStr: firebase.firestore.WhereFilterOp,
    value: any) : Promise<T | null>{
        var that : any = this;
        return await that.where(fieldPath,opStr,value).getOne();
    }

    
     async find(fieldPath: string,
    opStr: firebase.firestore.WhereFilterOp,
    value: any) : Promise<Array<this>>{
        var that : any = this;
        return await that.where(fieldPath,opStr,value).get();
    }

     getSnapshot() : Promise<firebase.firestore.DocumentSnapshot>{
      return new Promise((resolve, reject) => {
        this.getDocReference().onSnapshot((doc) => {
          if(doc){
            resolve(doc);
          }else{
            reject(doc); 
          }
        });
      })
    }
    
     async findOne(fieldPath: string,
    opStr: firebase.firestore.WhereFilterOp,
    value: any) : Promise<this | null>{
        var that : any = this;
        return await that.where(fieldPath,opStr,value).getOne();
    }

    getRequiredFields(): Array<string> {
      var that: any = this;
      return that.requiredFields ? that.requiredFields : [];
    }

    verifyRequiredFields(): boolean {
      var that: any = this;
      var fields = this.getRequiredFields();
      var result = true;
      for (var i = 0; fields.length > i; i++) {
        if (that[fields[i]] == null || typeof that[fields[i]] === undefined) {
          result = false;
          console.error(
            this.referencePath +
              "/:" +
              this.pathId +
              " - " +
              "Can't save " +
              fields[i] +
              " with null!"
          );
        }
      }
      return result;
    }

    getFieldName(key : string) : string {
      return this['aliasFieldsMapper'] && this['aliasFieldsMapper'][key] ? this['aliasFieldsMapper'][key] : key;
    }

    getDocumentData(): Object {
        var data = {};
        this['storedFields'].forEach((fieldName:string) => {
          fieldName = this.getFieldName(fieldName);
          var val;
          if(typeof this[fieldName] !== 'undefined'){
            val = this[fieldName];
          }else if(this['data'] && typeof this['data'][fieldName] !== 'undefined'){
            val = this['data'][fieldName];
          }
          if(val instanceof BaseModel){
            data[fieldName] = val.getDocReference();
        }else{
            data[fieldName] = val;
        }
        }); 
      return data;
    }

    /**
     * Alias of getDocumentData
     */
    getData() : Object {
      var result = {};
      var data = this.getDocumentData();
      for(var key in data){
        if(!(this['ignoredFields'] && this['ignoredFields'].includes(key))){
          result[key] = data[key];
        }
      }
      return result;
    }

    getPathList(): Array<{ type: string; value: string }> | boolean {
      var that: any = this;
      var result = [];
      var path = this.getReferencePath();
      var newTxt = path.split("/");
      for (var x = 0; x < newTxt.length; x++) {
        var subPath = newTxt[x];
        if (subPath.search(":") != -1) {
          subPath = subPath.replace(":", "");
          var value;
          if(that[subPath]){
            value = that[subPath];
        }else if(FirestoreOrmRepository.getGlobalPath(subPath)){
            value = FirestoreOrmRepository.getGlobalPath(subPath);
        }else {
            console.error(
              this.referencePath +
                "/:" +
                this.pathId +
                " - " +
                subPath +
                " is missing!"
            );
            return false;
          }
            result.push({
              type: "document",
              value: value
            });
        } else {
          result.push({
            type: "collection",
            value: subPath
          });
        }
      }
      return result;
    }

    getPathListParams(): any {
      var that: any = this;
      var result: any = {};
      var keys = this.getPathListKeys();
      for (var i = 0; i < keys.length; i++) {
        var subPath = keys[i];
        var value;
        if(that[subPath]){
            value = that[subPath];
        }else if(FirestoreOrmRepository.getGlobalPath(subPath)){
            value = FirestoreOrmRepository.getGlobalPath(subPath);
        }else{
            console.error(
              this.referencePath +
                "/:" +
                this.pathId +
                " - " +
                subPath +
                " is missing!"
            );
            return false;
        }
        result[subPath] = value;
      }
      return result;
    }

    getPathListKeys(): Array<string> {
      var that: any = this;
      var result = [];
      var path = this.getReferencePath();
      var newTxt = path.split("/");
      for (var x = 0; x < newTxt.length; x++) {
        var subPath = newTxt[x];
        if (subPath.search(":") != -1) {
          subPath = subPath.replace(":", "");
          result.push(subPath);
        }
      }
      return result;
    }
}    