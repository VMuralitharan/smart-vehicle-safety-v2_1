import React,{useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {ActionButton,Card,Heading,Info} from '../components/UI';
import {colors as c} from '../components/theme';
import {importLegacyVehicles} from '../lib/database';
export function LegacyRestore({uid,count,onNew,onImported,onLogout,logoutBusy}:{uid:string;count:number;onNew:()=>void;onImported:()=>void;onLogout:()=>void;logoutBusy:boolean}){
 const [busy,setBusy]=useState(false);
 const run=()=>Alert.alert('Import previous records?',`Found ${count} previously registered vehicle(s). The old data will be preserved.`,[
 {text:'Cancel',style:'cancel'},{text:'Import',onPress:async()=>{setBusy(true);
 try{const n=await importLegacyVehicles(uid);Alert.alert('Import complete',`${n} vehicle(s) and their contacts were copied.`);onImported();}
 catch(e:any){Alert.alert('Import failed',e?.message||'Try again.');}finally{setBusy(false);}}}]);
 return <View style={{flex:1,backgroundColor:c.background,padding:20,justifyContent:'center'}}>
 <Heading title="Welcome back" subtitle="We found vehicle records from the previous app version."/>
 <Card><Text style={{color:c.navy,fontWeight:'900',fontSize:20}}>{count} previous vehicle(s)</Text>
 <Text style={{color:c.muted,marginVertical:13}}>Import your existing vehicles and emergency contacts into the new owner/passenger data structure.</Text>
 <ActionButton title={busy?'Importing…':'Import my previous vehicles'} disabled={busy} onPress={run}/>
 <ActionButton title="Register a new bus instead" variant="secondary" onPress={onNew}/>
 <ActionButton title={logoutBusy?'Logging out…':'Logout'} variant="secondary" disabled={busy||logoutBusy} onPress={onLogout}/></Card>
 <Info text="The old records are retained under your private account path. The import does not turn old prototype incidents into verified hardware alerts."/>
 </View>;
}
