import React,{useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {ActionButton,Card,Field,Heading,Info} from '../components/UI';
import {addVehicle,convertEmptyOwnerToPassenger} from '../lib/database';
import {isValidPhoneNumber} from '../lib/phone';
import {colors as c} from '../components/theme';
export function VehicleSetup({uid,onCreated,onCancel,allowRoleCorrection=false,onLogout,logoutBusy}:{uid:string;onCreated:(id:string)=>void;onCancel?:()=>void;allowRoleCorrection?:boolean;onLogout:()=>void;logoutBusy:boolean}){
 const [name,setName]=useState('');const [plate,setPlate]=useState('');const [route,setRoute]=useState('');const [deviceLabel,setDeviceLabel]=useState('');const [driverPhone,setDriverPhone]=useState('');const [busy,setBusy]=useState(false);
 const correctRole=()=>Alert.alert('Switch this account to Passenger?', 'This account has no registered buses. You will go to Join your bus instead of Register vehicle.', [
  {text:'Cancel',style:'cancel'},
  {text:'Switch to Passenger',onPress:async()=>{setBusy(true);try{await convertEmptyOwnerToPassenger(uid);}catch(e:any){Alert.alert('Unable to change role',e?.message||'Try again.');}finally{setBusy(false);}}},
 ]);
 const save=async()=>{if(!name.trim()||!plate.trim()||!driverPhone.trim()){Alert.alert('Missing details','Enter the bus name, registration number and driver phone number.');return;}
 if(!isValidPhoneNumber(driverPhone)){Alert.alert('Check driver phone','Enter a valid phone number, such as 0771234567 or +94771234567.');return;}
 setBusy(true);try{const id=await addVehicle(uid,{name,plateNumber:plate,route,deviceLabel,driverPhone});onCreated(id);}catch(e:any){Alert.alert('Unable to register',e?.message||'Try again.');}finally{setBusy(false);}};
 return <View style={{flex:1,backgroundColor:c.background,padding:17}}><Heading title="Register your vehicle" subtitle="Create the bus record before linking a device or inviting passengers."/>
 <Card><Field label="Bus name" value={name} onChangeText={setName} placeholder="My bus"/>
 <Field label="Registration number" value={plate} onChangeText={setPlate} placeholder="NB-1234" autoCapitalize="characters"/>
 <Field label="Route / destination" value={route} onChangeText={setRoute} placeholder="Jaffna – Colombo"/>
 <Field label="Driver phone number" value={driverPhone} onChangeText={setDriverPhone} placeholder="0771234567 or +94771234567" keyboardType="phone-pad"/>
 <Field label="Device label (optional, not paired)" value={deviceLabel} onChangeText={setDeviceLabel} placeholder="SVS-0001"/>
 <ActionButton title={busy?'Saving…':'Register vehicle'} disabled={busy} onPress={save}/>
 {allowRoleCorrection?<ActionButton title="I am a PASSENGER — switch account type" variant="secondary" disabled={busy} onPress={correctRole}/>:null}
 {onCancel?<ActionButton variant="secondary" title="Back" onPress={onCancel}/>:<ActionButton variant="secondary" title={logoutBusy?'Logging out…':'Logout'} disabled={busy||logoutBusy} onPress={onLogout}/>}</Card>
 <Info text="The hardware label is for inventory only. The app will not show GPS or sensor readings until a separately authenticated device sends actual data."/>
 <Text style={{color:c.muted,textAlign:'center',fontSize:12}}>You can edit these vehicle details later.</Text></View>;
}
