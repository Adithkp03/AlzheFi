import React,{useEffect,useState} from 'react';
import {Image} from 'react-native';
import {loadLocalMedicationPhoto} from '../Services/medicationExtras';
export default function MedicationPhoto({owner,plan,revision}:any){const [uri,setUri]=useState('');useEffect(()=>{let active=true;setUri('');loadLocalMedicationPhoto(owner,plan).then(x=>{if(active)setUri(x);}).catch(()=>{});return()=>{active=false;setUri('');};},[owner,plan,revision]);return uri?<Image source={{uri}} accessibilityLabel="Local medicine photo,not proof of medicine or dose" style={{height:120,width:120,borderRadius:10}}/>:null;}
